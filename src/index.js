'use strict';

const { loadConfig } = require('./config');
const { makeLogger } = require('./logger');
const { Metrics } = require('./metrics');
const { createStore } = require('./store');
const { Dedup } = require('./dedup');
const DiscordSender = require('./discord');
const { createApp, loadParsers } = require('./app');

async function main() {
  const log = makeLogger();
  const config = loadConfig();
  const metrics = new Metrics();
  const store = createStore(config, log);
  await store.init(); // fail fast: compose restarts us until the database is reachable

  const sender = new DiscordSender(config, { store, metrics, log });
  const dedup = new Dedup({ windowSec: config.dedup.window_sec, maxEntries: config.dedup.max_entries });
  const parsers = loadParsers(undefined, log);
  const app = createApp({ config, store, sender, dedup, metrics, log, parsers });

  const server = app.listen(config.port, () => {
    log.info('DiscoRelay listening', {
      version: config.version,
      port: config.port,
      routes: Object.keys(config.discord),
      sources: Object.keys(parsers),
      auth: config.auth.required,
      history: store.enabled,
      dedupWindowSec: config.dedup.window_sec,
    });
    if (!config.auth.required) log.warn('AUTH DISABLED: any host that can reach this port can post to your Discord');
  });

  let pruneTimer = null;
  if (store.enabled) {
    const prune = () => store.prune()
      .then(n => n && log.info('pruned history', { rows: n }))
      .catch(err => log.warn('prune failed', { error: err.message }));
    prune();
    pruneTimer = setInterval(prune, 6 * 60 * 60 * 1000);
  }

  let shuttingDown = false;
  const shutdown = async signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });
    if (pruneTimer) clearInterval(pruneTimer);
    server.close();
    const drained = await sender.drain(20000);
    if (!drained) log.warn('shutdown with payloads still queued', { queue: sender.depths() });
    await store.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'fatal', error: err.message }) + '\n');
    process.exit(1);
  });
}

module.exports = { main };
