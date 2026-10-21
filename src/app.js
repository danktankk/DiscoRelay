'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { authorize } = require('./auth');
const { toPayloads, firstTitle } = require('./normalize');
const { fingerprint } = require('./dedup');

function loadParsers(dir = path.join(__dirname, 'parsers'), log) {
  const parsers = {};
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.js')) continue;
    const name = file.slice(0, -3);
    parsers[name] = require(path.join(dir, file));
    log && log.info('parser loaded', { source: name });
  }
  return parsers;
}

function testEmbed(route, version) {
  return {
    embeds: [{
      author: { name: 'DiscoRelay' },
      title: `Test notification → ${route}`,
      description: `If you can read this, route \`${route}\` is wired correctly.`,
      color: 0x3B82F6,
      footer: { text: `DiscoRelay v${version}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

function createApp({ config, store, sender, dedup, metrics, log, parsers }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, uniquelocal');
  app.use(express.json({ limit: '2mb', type: ['application/json', 'application/*+json', 'text/json'] }));
  app.use(express.text({ limit: '2mb', type: ['text/plain'] }));

  const deny = (res, auth, scope) => {
    metrics.inc('rejected_total', { reason: 'auth' });
    log.warn('unauthorized', { scope, reason: auth.reason });
    return res.status(401).json({ error: 'unauthorized', reason: auth.reason });
  };

  app.post('/webhook/:source', async (req, res) => {
    const source = req.params.source;
    const parser = parsers[source];
    if (!parser) {
      metrics.inc('rejected_total', { reason: 'unknown_source' });
      return res.status(404).json({ error: `Unknown source: ${source}`, sources: Object.keys(parsers) });
    }
    const auth = authorize(config, req, source);
    if (!auth.ok) return deny(res, auth, source);
    metrics.inc('received_total', { source });

    let payloads;
    try {
      const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
      const result = parser.parse(body, config, { source, query: req.query, headers: req.headers, ip: req.ip });
      const cfgRoute = config.sources[source] && config.sources[source].route;
      const defaultRoute = cfgRoute && cfgRoute !== 'auto' ? cfgRoute : 'daily';
      payloads = toPayloads(result, defaultRoute);
    } catch (err) {
      metrics.inc('rejected_total', { reason: 'parse_error' });
      log.error('parse failed', { source, ip: req.ip, error: err.message });
      return res.status(400).json({ error: `parse failed: ${err.message}` });
    }
    if (!payloads.length) return res.json({ ok: true, queued: 0, suppressed: 0, dropped: 0, ids: [] });

    const windowSec = dedup.windowFor(config, source);
    const result = { ok: true, queued: 0, suppressed: 0, dropped: 0, ids: [] };
    for (const p of payloads) {
      const fp = fingerprint(source, p.body);
      const title = firstTitle(p.body);
      const base = { source, route: p.route, fingerprint: fp, title, body: p.body, requestIp: req.ip };

      const d = dedup.check(source, fp, windowSec);
      if (d.suppressed) {
        result.suppressed += 1;
        metrics.inc('suppressed_total', { source });
        log.info('suppressed duplicate', { source, route: p.route, title, count: d.count, windowSec });
        await store.insert({ ...base, status: 'suppressed' }).catch(err => log.warn('store.insert failed', { error: err.message }));
        continue;
      }
      if (!config.discord[p.route]) {
        result.dropped += 1;
        result.ok = false;
        metrics.inc('failed_total', { route: p.route, reason: 'no_webhook' });
        log.error('no webhook for route', { source, route: p.route, title });
        await store.insert({ ...base, status: 'dropped', lastError: `no webhook for route ${p.route}` }).catch(err => log.warn('store.insert failed', { error: err.message }));
        continue;
      }
      const id = await store.insert({ ...base, status: 'queued' }).catch(err => { log.warn('store.insert failed', { error: err.message }); return null; });
      result.ids.push(id);
      sender.enqueue({ id, source, route: p.route, body: p.body });
      result.queued += 1;
      metrics.inc('queued_total', { route: p.route });
    }
    log.info('webhook accepted', { source, ip: req.ip, queued: result.queued, suppressed: result.suppressed, dropped: result.dropped });
    res.status(result.queued ? 202 : 200).json(result);
  });

  app.get('/health', async (req, res) => {
    let db;
    try { db = await store.health(); } catch (err) { db = { enabled: true, ok: false, error: err.message }; }
    const ok = !db.enabled || db.ok;
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      version: config.version,
      sources: Object.keys(parsers),
      routes: Object.keys(config.discord),
      auth: config.auth.required,
      queue: sender.depths(),
      db,
    });
  });

  app.get('/metrics', (req, res) => {
    if (!config.metrics.public) {
      const auth = authorize(config, req, 'metrics');
      if (!auth.ok) return deny(res, auth, 'metrics');
    }
    metrics.set('up', {}, 1);
    res.type('text/plain; version=0.0.4; charset=utf-8').send(metrics.render());
  });

  app.get('/api/history', async (req, res) => {
    const auth = authorize(config, req, 'admin');
    if (!auth.ok) return deny(res, auth, 'admin');
    if (!store.enabled) return res.status(501).json({ error: 'history disabled: no DATABASE_URL' });
    const rows = await store.recent({ limit: req.query.limit, source: req.query.source, status: req.query.status, route: req.query.route });
    res.json(rows);
  });

  app.post('/api/test/:route', (req, res) => {
    const auth = authorize(config, req, 'admin');
    if (!auth.ok) return deny(res, auth, 'admin');
    const route = req.params.route;
    if (!config.discord[route]) return res.status(404).json({ error: `unknown route: ${route}`, routes: Object.keys(config.discord) });
    sender.enqueue({ id: null, source: 'test', route, body: testEmbed(route, config.version) });
    res.status(202).json({ ok: true, route });
  });

  // Body-parser and other errors → JSON, never an HTML stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) log.error('request error', { path: req.path, error: err.message });
    else metrics.inc('rejected_total', { reason: 'bad_request' });
    res.status(status).json({ error: status >= 500 ? 'internal error' : err.message });
  });

  return app;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return { message: text }; }
}

module.exports = { createApp, loadParsers };
