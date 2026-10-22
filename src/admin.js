'use strict';

// Setup / admin page: the part Notifiarr has and a bare relay does not. Everything here is token-gated
// with the `admin` scope; the page itself is static and asks for the token in the browser.
const path = require('path');
const express = require('express');
const { authorize } = require('./auth');
const { toPayloads, firstTitle, clean } = require('./normalize');
const { validateSource, validateWebhook, validateRouteName } = require('./settings');

const SENDER_SNIPPETS = {
  radarr: { title: 'Radarr / Sonarr / Lidarr', how: 'Settings → Connect → + → Webhook. URL below, Method POST. Tick every trigger you want (Grab, Import, Upgrade, Health, Application Update…). One connection per instance; the 4K/3D instances use the same URL.', url: '{HUB}/webhook/radarr?token={TOKEN}', also: ['{HUB}/webhook/sonarr?token={TOKEN}', '{HUB}/webhook/lidarr?token={TOKEN}'] },
  tautulli: { title: 'Tautulli', how: 'Settings → Notification Agents → + → Webhook. Webhook URL below, Method POST. In Data, use JSON with the fields you want (action, title, user, player…). Enable the triggers you care about.', url: '{HUB}/webhook/tautulli?token={TOKEN}' },
  diun: { title: 'DIUN', how: 'Webhook notifier only: endpoint below, method POST, timeout 10s. Comment out every DIUN_NOTIF_DISCORD_* line. The hub forwards the raw payload to diun-dash if sources.diun.forward is set.', url: '{HUB}/webhook/diun?token={TOKEN}' },
  crowdsec: { title: 'CrowdSec', how: 'notifications/discorelay.yaml, type http, url below, header X-Relay-Token: {TOKEN}; add discorelay to profiles.yaml notifications.', url: '{HUB}/webhook/crowdsec' },
  uptimekuma: { title: 'Uptime Kuma', how: 'Settings → Notifications → Webhook. URL below, content type application/json, additional header {"X-Relay-Token": "{TOKEN}"}. Apply to all monitors.', url: '{HUB}/webhook/uptimekuma' },
  backrest: { title: 'Backrest', how: 'Plan/Repo hooks → Command: curl -s -X POST -H "X-Relay-Token: {TOKEN}" -H "Content-Type: application/json" -d \'{"status":"{{ .Task }}…"}\' URL', url: '{HUB}/webhook/backrest' },
  graylog: { title: 'Graylog', how: 'Alerts → Notifications → HTTP Notification, URL below.', url: '{HUB}/webhook/graylog?token={TOKEN}' },
  grafana: { title: 'Grafana', how: 'Alerting → Contact points → Webhook, URL below. Severity label drives the route.', url: '{HUB}/webhook/grafana?token={TOKEN}' },
  homeassistant: { title: 'Home Assistant', how: 'rest_command or shell_command posting JSON {title, message, severity} to the URL, or point an existing Discord webhook field at the passthrough.', url: '{HUB}/webhook/homeassistant?token={TOKEN}' },
  unraid: { title: 'UnRAID', how: 'Settings → Notifications → Agents → custom script posting the event JSON to the URL.', url: '{HUB}/webhook/unraid?token={TOKEN}' },
  discord: { title: 'Any app with a Discord webhook field', how: 'Paste the URL below where the app asks for a Discord webhook. Payload is forwarded as-is; the hub answers 204 like Discord. Change route= to pick the channel.', url: '{HUB}/webhook/discord?route=updates&token={TOKEN}' },
  notifiarr: { title: 'Scripts written for Notifiarr', how: 'Keep the Notifiarr passthrough JSON, change only the host.', url: '{HUB}/api/v1/notification/passthrough/{TOKEN}' },
  generic: { title: 'Scripts, cron, Ansible', how: 'curl -s -X POST -H "X-Relay-Token: {TOKEN}" -H "Content-Type: application/json" -d \'{"title":"Disk 91%","message":"/var on pve1","severity":"warning","host":"pve1","source":"disk-check"}\' URL', url: '{HUB}/webhook/generic' },
};

function maskWebhook(url) {
  const m = /webhooks\/(\d+)\/([\w-]+)/.exec(url || '');
  if (!m) return url ? '••••' : '';
  return `…/webhooks/${m[1]}/${m[2].slice(0, 4)}…${m[2].slice(-4)}`;
}

function maskKey(k) { return k ? `${String(k).slice(0, 3)}…${String(k).slice(-2)}` : ''; }

function mountAdmin(app, { config, store, sender, dedup, metrics, log, parsers, services = {}, settings, fetchImpl }) {
  const startedAt = Date.now();
  const staticDir = path.join(__dirname, 'admin');

  app.get('/admin', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  app.use('/admin', express.static(staticDir, { index: false, maxAge: '5m' }));

  const api = express.Router();
  api.use((req, res, next) => {
    const auth = authorize(config, req, 'admin');
    if (!auth.ok) { metrics.inc('rejected_total', { reason: 'auth' }); return res.status(401).json({ error: 'unauthorized', reason: auth.reason }); }
    next();
  });

  const sourceView = async (name) => {
    const cfg = config.sources[name] || {};
    const parser = parsers[name];
    return {
      name,
      label: parser && parser.name ? parser.name : name,
      route: cfg.route || 'auto',
      dedup_window_sec: cfg.dedup_window_sec !== undefined ? cfg.dedup_window_sec : config.dedup.window_sec,
      dedup_default: cfg.dedup_window_sec === undefined,
      events: parser && Array.isArray(parser.events) ? parser.events : [],
      event_routes: cfg.events || {},
      forward: cfg.forward || [],
      icon: cfg.icon || '',
      overridden: settings ? settings.overridden(`sources.${name}`) : false,
    };
  };

  api.get('/overview', async (req, res) => {
    let db;
    try { db = await store.health(); } catch (err) { db = { enabled: true, ok: false, error: err.message }; }
    const stats = store.enabled ? await store.sourceStats(24).catch(() => ({})) : {};
    const routeStats = store.enabled ? await store.routeStats(24).catch(() => ({})) : {};
    const sources = [];
    for (const name of Object.keys(parsers).sort()) sources.push({ ...(await sourceView(name)), stats: stats[name] || null });
    const routes = Object.keys(config.discord).sort().map(name => ({
      name, masked: maskWebhook(config.discord[name]), overridden: settings ? settings.overridden(`discord.${name}`) : false, stats: routeStats[name] || null, queue: (sender.depths() || {})[name] || 0,
    }));
    res.json({
      version: config.version,
      uptime_sec: Math.round((Date.now() - startedAt) / 1000),
      auth: config.auth.required,
      db,
      queue: sender.depths(),
      geoip: { enabled: services.geoip ? !!services.geoip.enabled : (config.geoip || {}).enabled !== false },
      enrich: services.enrich ? services.enrich.providers : { tmdb: false, omdb: false, github: false },
      dedup_window_sec: config.dedup.window_sec,
      persisted: !!(settings && store.enabled),
      routes,
      sources,
      failed_recent: store.enabled ? await store.recent({ limit: 10, status: 'failed' }).catch(() => []) : [],
    });
  });

  api.get('/sources', async (req, res) => {
    const out = [];
    for (const name of Object.keys(parsers).sort()) out.push(await sourceView(name));
    res.json(out);
  });

  api.put('/sources/:name', async (req, res, next) => {
    try {
      const name = req.params.name;
      if (!parsers[name]) return res.status(404).json({ error: `unknown source: ${name}` });
      const cleaned = validateSource(req.body || {}, config);
      const current = (settings && settings.values[`sources.${name}`]) || {};
      const merged = { ...current, ...cleaned };
      if (settings) await settings.set(`sources.${name}`, merged);
      else Object.assign(config.sources[name] = config.sources[name] || {}, merged);
      res.json(await sourceView(name));
    } catch (err) { next(err); }
  });

  api.delete('/sources/:name', async (req, res, next) => {
    try {
      const name = req.params.name;
      if (!parsers[name]) return res.status(404).json({ error: `unknown source: ${name}` });
      if (settings) await settings.unset(`sources.${name}`);
      res.json(await sourceView(name));
    } catch (err) { next(err); }
  });

  api.get('/routes', (req, res) => {
    res.json(Object.keys(config.discord).sort().map(name => ({ name, masked: maskWebhook(config.discord[name]), overridden: settings ? settings.overridden(`discord.${name}`) : false })));
  });

  api.put('/routes/:route', async (req, res, next) => {
    try {
      const route = validateRouteName(req.params.route);
      const url = validateWebhook(req.body && req.body.webhook);
      if (settings) await settings.set(`discord.${route}`, url); else config.discord[route] = url;
      res.json({ name: route, masked: maskWebhook(url), overridden: true });
    } catch (err) { next(err); }
  });

  api.delete('/routes/:route', async (req, res, next) => {
    try {
      const route = validateRouteName(req.params.route);
      if (settings) await settings.unset(`discord.${route}`);
      res.json({ name: route, masked: maskWebhook(config.discord[route]), overridden: false, exists: !!config.discord[route] });
    } catch (err) { next(err); }
  });

  api.post('/routes/:route/test', (req, res) => {
    const route = req.params.route;
    if (!config.discord[route]) return res.status(404).json({ error: `unknown route: ${route}` });
    sender.enqueue({ id: null, source: 'test', route, body: {
      embeds: [{ author: { name: 'DiscoRelay' }, title: `Test notification → ${route}`, description: `If you can read this, route \`${route}\` is wired correctly.`, color: 0x3B82F6, footer: { text: `DiscoRelay v${config.version}` }, timestamp: new Date().toISOString() }],
    } });
    res.status(202).json({ ok: true, route });
  });

  api.get('/history', async (req, res) => {
    if (!store.enabled) return res.json({ enabled: false, rows: [] });
    const rows = await store.recentDetailed({ limit: req.query.limit, source: req.query.source, status: req.query.status, route: req.query.route, q: req.query.q });
    res.json({ enabled: true, rows });
  });

  api.get('/history/:id', async (req, res) => {
    if (!store.enabled) return res.status(501).json({ error: 'history disabled: no DATABASE_URL' });
    const row = await store.getNotification(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  });

  api.post('/history/:id/resend', async (req, res) => {
    if (!store.enabled) return res.status(501).json({ error: 'history disabled: no DATABASE_URL' });
    const row = await store.getNotification(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const route = (req.body && req.body.route) || row.route;
    if (!config.discord[route]) return res.status(404).json({ error: `unknown route: ${route}` });
    const id = await store.insert({ source: row.source, route, fingerprint: row.fingerprint, title: row.title, status: 'queued', body: row.body, requestIp: req.ip }).catch(() => null);
    sender.enqueue({ id, source: row.source, route, body: row.body });
    res.status(202).json({ ok: true, id, route });
  });

  api.get('/settings', (req, res) => {
    const geo = config.geoip || {}, en = config.enrich || {};
    res.json({
      dedup: { window_sec: (config.dedup || {}).window_sec },
      geoip: { enabled: geo.enabled !== false, map: geo.map !== false, zoom: geo.zoom || 10 },
      enrich: { github: en.github !== false, tmdb_api_key: maskKey(en.tmdb_api_key), omdb_api_key: maskKey(en.omdb_api_key), tmdb: !!en.tmdb_api_key, omdb: !!en.omdb_api_key },
      store: { enabled: store.enabled, retention_days: (config.store || {}).retention_days },
      overridden: settings ? Object.keys(settings.values).filter(k => !k.includes('.')) : [],
    });
  });

  api.put('/settings', async (req, res, next) => {
    try {
      const b = req.body || {};
      if (b.dedup && b.dedup.window_sec !== undefined) {
        const n = Number(b.dedup.window_sec);
        if (!Number.isFinite(n) || n < 0 || n > 31 * 86400) { const e = new Error('dedup.window_sec must be 0..2678400'); e.status = 400; throw e; }
        const v = { ...((settings && settings.values.dedup) || {}), window_sec: Math.round(n) };
        if (settings) await settings.set('dedup', v); else { config.dedup.window_sec = v.window_sec; if (dedup) dedup.windowSec = v.window_sec; }
      }
      if (b.geoip) {
        const v = { ...((settings && settings.values.geoip) || {}) };
        if (b.geoip.enabled !== undefined) v.enabled = !!b.geoip.enabled;
        if (b.geoip.map !== undefined) v.map = !!b.geoip.map;
        if (b.geoip.zoom !== undefined) { const z = Number(b.geoip.zoom); if (!(z >= 1 && z <= 16)) { const e = new Error('geoip.zoom must be 1..16'); e.status = 400; throw e; } v.zoom = Math.round(z); }
        if (settings) await settings.set('geoip', v); else Object.assign(config.geoip = config.geoip || {}, v);
      }
      if (b.enrich) {
        const v = { ...((settings && settings.values.enrich) || {}) };
        if (b.enrich.github !== undefined) v.github = !!b.enrich.github;
        for (const k of ['tmdb_api_key', 'omdb_api_key']) if (b.enrich[k] !== undefined) v[k] = String(b.enrich[k] || '').trim();
        if (settings) await settings.set('enrich', v); else Object.assign(config.enrich = config.enrich || {}, v);
      }
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  api.get('/senders', (req, res) => {
    const hub = `${req.protocol}://${req.get('host')}`;
    res.json({ hub, snippets: Object.entries(SENDER_SNIPPETS).map(([key, s]) => ({ key, ...s, available: !!parsers[key] || key === 'notifiarr' })) });
  });

  /** Dry run: parse a payload for a source and return the Discord payloads without sending. */
  api.post('/preview', async (req, res) => {
    const source = req.body && req.body.source;
    const parser = parsers[source];
    if (!parser) return res.status(404).json({ error: `unknown source: ${source}`, sources: Object.keys(parsers) });
    try {
      const result = await parser.parse(req.body.body, config, { source, query: req.body.query || {}, headers: {}, ip: req.ip, services });
      const cfgRoute = config.sources[source] && config.sources[source].route;
      const payloads = toPayloads(result, cfgRoute && cfgRoute !== 'auto' ? cfgRoute : 'daily', config.sources[source]);
      for (const p of payloads) clean(p.body);
      res.json({ payloads, title: payloads[0] ? firstTitle(payloads[0].body) : null });
    } catch (err) {
      res.status(400).json({ error: `parse failed: ${err.message}` });
    }
  });

  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) log.error('admin error', { path: req.path, error: err.message });
    res.status(status).json({ error: err.message });
  });

  app.use('/api/admin', api);
  void fetchImpl;
}

module.exports = { mountAdmin, maskWebhook, SENDER_SNIPPETS };
