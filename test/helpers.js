'use strict';

const http = require('http');
const { Metrics } = require('../src/metrics');
const { NullStore } = require('../src/store');
const { Dedup } = require('../src/dedup');
const DiscordSender = require('../src/discord');
const { createApp, loadParsers } = require('../src/app');

const quietLog = { debug() {}, info() {}, warn() {}, error() {} };

/** Fake Discord: records every POST, answers from a programmable response queue (default 204). */
function startFakeDiscord() {
  const received = [];
  const responses = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      received.push({ path: req.url, body: body ? JSON.parse(body) : null });
      const next = responses.shift() || { status: 204 };
      if (next.hang) return; // never answer: exercises the timeout path
      if (next.headers) for (const [k, v] of Object.entries(next.headers)) res.setHeader(k, v);
      res.statusCode = next.status;
      res.end(next.body || '');
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      // Looks like a Discord webhook URL, but points at us. config.js validates the pattern only.
      const webhook = route => `https://discord.com/api/webhooks/1234567890/${route}-token`;
      const fetchImpl = (url, opts) => {
        const u = new URL(url);
        return fetch(`http://127.0.0.1:${port}${u.pathname}`, opts);
      };
      resolve({ server, port, received, responses, webhook, fetchImpl, close: () => new Promise(r => server.close(r)) });
    });
  });
}

function baseConfig(fake, overrides = {}) {
  return {
    version: 'test',
    port: 0,
    discord: { critical: fake.webhook('critical'), warning: fake.webhook('warning'), daily: fake.webhook('daily'), updates: fake.webhook('updates'), media: fake.webhook('media'), backups: fake.webhook('backups') },
    sources: { grafana: { route: 'auto' }, radarr: { dedup_window_sec: 0 } },
    auth: { required: true, tokens: { 'test-token-0123456789': ['*'], 'crowdsec-only-token-1': ['crowdsec'] } },
    dedup: { window_sec: 300, max_entries: 100 },
    delivery: { timeout_ms: 300, max_attempts: 3, backoff_base_ms: 5, backoff_max_ms: 20, max_rate_limit_waits: 2, max_rate_limit_wait_ms: 50 },
    store: { retention_days: 1, database_url: null },
    metrics: { public: false },
    geoip: { enabled: true, map: true, zoom: 10, per_minute: 40 },
    enrich: { github: true, tmdb_api_key: '', omdb_api_key: '' },
    ...overrides,
  };
}

async function startApp(fake, overrides = {}, { now } = {}) {
  const config = baseConfig(fake, overrides);
  const metrics = new Metrics();
  const store = new NullStore();
  const sender = new DiscordSender(config, { store, metrics, log: quietLog, fetchImpl: fake.fetchImpl });
  const dedup = new Dedup({ windowSec: config.dedup.window_sec, maxEntries: config.dedup.max_entries, now });
  const parsers = loadParsers();
  const { Settings } = require('../src/settings');
  const services = {};
  const settings = await new Settings({ config, store, log: quietLog, services, dedup }).load();
  const app = createApp({ config, store, sender, dedup, metrics, log: quietLog, parsers, services, settings });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const get = (path, headers = {}) => fetch(base + path, { headers });
  const send = (method, path, body, headers = {}) => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const app_ = { config, metrics, sender, dedup, settings, base, post, get, send, doneLog: [], doneCursor: 0, close: () => new Promise(r => server.close(r)) };
  sender.on('done', entry => app_.doneLog.push(entry));
  return app_;
}

/**
 * Consume the next `count` delivery outcomes in order. Outcomes are logged from the moment the
 * app starts, so a delivery that finishes before this is called is not missed.
 */
async function waitDone(app, count = 1, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (app.doneLog.length - app.doneCursor < count) {
    if (Date.now() > deadline) throw new Error(`waited ${timeoutMs}ms for ${count} outcomes, got ${app.doneLog.length - app.doneCursor}`);
    await new Promise(r => setTimeout(r, 10));
  }
  const results = app.doneLog.slice(app.doneCursor, app.doneCursor + count);
  app.doneCursor += count;
  return results;
}

module.exports = { startFakeDiscord, startApp, baseConfig, waitDone, quietLog };
