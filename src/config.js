'use strict';

const fs = require('fs');
const path = require('path');

const WEBHOOK_RE = /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/;

const DEFAULTS = {
  dedup: { window_sec: 300, max_entries: 5000 },
  delivery: {
    timeout_ms: 10000,
    max_attempts: 5,
    backoff_base_ms: 1000,
    backoff_max_ms: 30000,
    max_rate_limit_waits: 5,
    max_rate_limit_wait_ms: 60000,
  },
  store: { retention_days: 90 },
  metrics: { public: false },
  geoip: { enabled: true, map: true, zoom: 10, per_minute: 40 },
  enrich: { github: true, tmdb_api_key: '', omdb_api_key: '' },
};

/**
 * Load config.json and overlay environment variables.
 *
 * Secrets never need to live in config.json:
 *   DISCORD_WEBHOOK_<ROUTE>   webhook URL for a route (CRITICAL, WARNING, DAILY, ...)
 *   RELAY_TOKEN               one token with access to every source and admin API
 *   RELAY_TOKENS              "tok:src1|src2,tok2:*" additional scoped tokens
 *   RELAY_AUTH_REQUIRED       "false" disables auth (migration mode only)
 *   DATABASE_URL              postgres://... enables delivery history
 *   PORT, DEDUP_WINDOW_SEC, RETENTION_DAYS, METRICS_PUBLIC, LOG_LEVEL
 */
function loadConfig(configPath, env = process.env) {
  const file = configPath || env.CONFIG_PATH || path.join(__dirname, '..', 'config.json');
  const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

  const cfg = {
    ...raw,
    discord: { ...(raw.discord || {}) },
    sources: { ...(raw.sources || {}) },
    auth: { required: true, ...(raw.auth || {}), tokens: { ...((raw.auth && raw.auth.tokens) || {}) } },
    dedup: { ...DEFAULTS.dedup, ...(raw.dedup || {}) },
    delivery: { ...DEFAULTS.delivery, ...(raw.delivery || {}) },
    store: { ...DEFAULTS.store, ...(raw.store || {}) },
    metrics: { ...DEFAULTS.metrics, ...(raw.metrics || {}) },
    geoip: { ...DEFAULTS.geoip, ...(raw.geoip || {}) },
    enrich: { ...DEFAULTS.enrich, ...(raw.enrich || {}) },
    channels: { ...(raw.channels || {}) },
  };
  if (env.GEOIP_ENABLED !== undefined) cfg.geoip.enabled = env.GEOIP_ENABLED !== 'false';
  if (env.TMDB_API_KEY) cfg.enrich.tmdb_api_key = env.TMDB_API_KEY.trim();
  if (env.OMDB_API_KEY) cfg.enrich.omdb_api_key = env.OMDB_API_KEY.trim();
  if (env.ENRICH_GITHUB !== undefined) cfg.enrich.github = env.ENRICH_GITHUB !== 'false';

  for (const [key, value] of Object.entries(env)) {
    const m = /^DISCORD_WEBHOOK_([A-Z0-9_]+)$/.exec(key);
    if (m && value) cfg.discord[m[1].toLowerCase()] = value.trim();
  }
  for (const [route, url] of Object.entries(cfg.discord)) {
    if (!url || /PASTE_YOUR/i.test(url)) {
      delete cfg.discord[route];
    } else if (!WEBHOOK_RE.test(url)) {
      throw new Error(`discord.${route} is not a Discord webhook URL`);
    }
  }

  cfg.port = Number(env.PORT || cfg.port || 3080);

  if (env.RELAY_TOKEN) cfg.auth.tokens[env.RELAY_TOKEN.trim()] = ['*'];
  if (env.RELAY_TOKENS) {
    for (const part of env.RELAY_TOKENS.split(',')) {
      const [tok, scopes] = part.trim().split(':');
      if (tok) cfg.auth.tokens[tok] = scopes ? scopes.split('|').map(s => s.trim()).filter(Boolean) : ['*'];
    }
  }
  if (env.RELAY_AUTH_REQUIRED !== undefined) cfg.auth.required = env.RELAY_AUTH_REQUIRED !== 'false';
  for (const tok of Object.keys(cfg.auth.tokens)) {
    if (tok.length < 16) throw new Error('relay tokens must be at least 16 characters');
  }
  if (cfg.auth.required && Object.keys(cfg.auth.tokens).length === 0) {
    throw new Error('auth.required is true but no tokens are configured (set RELAY_TOKEN)');
  }

  if (env.DEDUP_WINDOW_SEC !== undefined) cfg.dedup.window_sec = Number(env.DEDUP_WINDOW_SEC);
  if (env.RETENTION_DAYS !== undefined) cfg.store.retention_days = Number(env.RETENTION_DAYS);
  if (env.METRICS_PUBLIC !== undefined) cfg.metrics.public = env.METRICS_PUBLIC === 'true';
  cfg.store.database_url = env.DATABASE_URL || cfg.store.database_url || null;

  cfg.version = require('../package.json').version;
  return cfg;
}

module.exports = { loadConfig, WEBHOOK_RE, DEFAULTS };
