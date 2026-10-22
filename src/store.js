'use strict';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notifications (
  id            BIGSERIAL PRIMARY KEY,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  source        TEXT NOT NULL,
  route         TEXT NOT NULL,
  fingerprint   TEXT NOT NULL,
  title         TEXT,
  status        TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  request_ip    TEXT,
  body          JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_received_at_idx ON notifications (received_at DESC);
CREATE INDEX IF NOT EXISTS notifications_source_idx ON notifications (source, received_at DESC);
CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications (status);
CREATE TABLE IF NOT EXISTS deliveries (
  id              BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  http_status     INTEGER,
  error           TEXT
);
CREATE INDEX IF NOT EXISTS deliveries_notification_idx ON deliveries (notification_id);
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/** Used when DATABASE_URL is not set: the relay works, nothing is remembered. */
class NullStore {
  constructor() { this.enabled = false; }
  async init() {}
  async insert() { return null; }
  async recordAttempt() {}
  async finalize() {}
  async recent() { return []; }
  async recentDetailed() { return []; }
  async getNotification() { return null; }
  async sourceStats() { return {}; }
  async routeStats() { return {}; }
  async loadSettings() { return {}; }
  async putSetting() {}
  async deleteSetting() {}
  async prune() { return 0; }
  async health() { return { enabled: false }; }
  async close() {}
}

class PgStore {
  constructor(databaseUrl, { retentionDays = 90, log } = {}) {
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 30000 });
    this.retentionDays = retentionDays;
    this.log = log;
    this.enabled = true;
  }

  async init() {
    await this.pool.query(SCHEMA);
  }

  async insert({ source, route, fingerprint, title, status, body, requestIp, lastError }) {
    const { rows } = await this.pool.query(
      `INSERT INTO notifications (source, route, fingerprint, title, status, body, request_ip, last_error, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $5 IN ('suppressed','dropped') THEN now() ELSE NULL END)
       RETURNING id`,
      [source, route, fingerprint, title, status, JSON.stringify(body), requestIp || null, lastError || null]
    );
    return rows[0].id;
  }

  async recordAttempt(id, httpStatus, error) {
    if (!id) return;
    await this.pool.query(
      'INSERT INTO deliveries (notification_id, http_status, error) VALUES ($1,$2,$3)',
      [id, httpStatus || null, error || null]
    );
  }

  async finalize(id, status, error, attempts) {
    if (!id) return;
    await this.pool.query(
      'UPDATE notifications SET status=$2, last_error=$3, attempts=$4, finished_at=now() WHERE id=$1',
      [id, status, error || null, attempts || 0]
    );
  }

  async recent({ limit = 50, source, status, route } = {}) {
    const where = [];
    const params = [];
    if (source) { params.push(source); where.push(`source = $${params.length}`); }
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (route) { params.push(route); where.push(`route = $${params.length}`); }
    params.push(Math.min(Math.max(Number(limit) || 50, 1), 500));
    const sql = `SELECT id, received_at, finished_at, source, route, status, attempts, title, last_error, request_ip
                 FROM notifications ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY id DESC LIMIT $${params.length}`;
    const { rows } = await this.pool.query(sql, params);
    return rows;
  }

  /** Like recent() but with the Discord payload and optional title search, for the admin page. */
  async recentDetailed({ limit = 50, source, status, route, q } = {}) {
    const where = [];
    const params = [];
    if (source) { params.push(source); where.push(`source = $${params.length}`); }
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (route) { params.push(route); where.push(`route = $${params.length}`); }
    if (q) { params.push(`%${String(q).slice(0, 100)}%`); where.push(`title ILIKE $${params.length}`); }
    params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
    const sql = `SELECT id, received_at, finished_at, source, route, status, attempts, title, last_error, request_ip, body
                 FROM notifications ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY id DESC LIMIT $${params.length}`;
    const { rows } = await this.pool.query(sql, params);
    return rows;
  }

  async getNotification(id) {
    const n = Number(id);
    if (!Number.isFinite(n)) return null;
    const { rows } = await this.pool.query('SELECT * FROM notifications WHERE id = $1', [n]);
    if (!rows[0]) return null;
    const d = await this.pool.query('SELECT id, attempted_at, http_status, error FROM deliveries WHERE notification_id = $1 ORDER BY id', [n]);
    return { ...rows[0], deliveries: d.rows };
  }

  /** Per-source counts over the last `hours`: { source: { total, sent, failed, suppressed, dropped, last_at } }. */
  async sourceStats(hours = 24) {
    const { rows } = await this.pool.query(
      `SELECT source,
              count(*)::int AS total,
              count(*) FILTER (WHERE status = 'sent')::int AS sent,
              count(*) FILTER (WHERE status = 'failed')::int AS failed,
              count(*) FILTER (WHERE status = 'suppressed')::int AS suppressed,
              count(*) FILTER (WHERE status = 'dropped')::int AS dropped,
              max(received_at) AS last_at
       FROM notifications WHERE received_at > now() - make_interval(hours => $1)
       GROUP BY source`, [hours]);
    const out = {};
    for (const r of rows) out[r.source] = r;
    return out;
  }

  async routeStats(hours = 24) {
    const { rows } = await this.pool.query(
      `SELECT route,
              count(*) FILTER (WHERE status = 'sent')::int AS sent,
              count(*) FILTER (WHERE status = 'failed')::int AS failed,
              max(finished_at) FILTER (WHERE status = 'sent') AS last_sent_at
       FROM notifications WHERE received_at > now() - make_interval(hours => $1)
       GROUP BY route`, [hours]);
    const out = {};
    for (const r of rows) out[r.route] = r;
    return out;
  }

  async loadSettings() {
    const { rows } = await this.pool.query('SELECT key, value FROM settings');
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async putSetting(key, value) {
    await this.pool.query(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
      [key, JSON.stringify(value)]
    );
  }

  async deleteSetting(key) {
    await this.pool.query('DELETE FROM settings WHERE key = $1', [key]);
  }

  async prune() {
    const { rowCount } = await this.pool.query(
      `DELETE FROM notifications WHERE received_at < now() - make_interval(days => $1)`,
      [this.retentionDays]
    );
    return rowCount;
  }

  async health() {
    const { rows } = await this.pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE received_at > now() - interval '24 hours')::int AS last_24h,
              count(*) FILTER (WHERE status = 'failed' AND received_at > now() - interval '24 hours')::int AS failed_24h,
              count(*) FILTER (WHERE status = 'queued')::int AS queued
       FROM notifications`
    );
    return { enabled: true, ok: true, ...rows[0] };
  }

  async close() { await this.pool.end(); }
}

function createStore(config, log) {
  if (!config.store || !config.store.database_url) return new NullStore();
  return new PgStore(config.store.database_url, { retentionDays: config.store.retention_days, log });
}

module.exports = { createStore, PgStore, NullStore, SCHEMA };
