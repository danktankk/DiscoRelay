'use strict';

// Runtime settings layer: overrides saved from the admin page live in Postgres (table `settings`) and are
// applied over config.json at boot and immediately on save. config.json stays the secret-free baseline.
//
// Keys:  sources.<name>   { route, dedup_window_sec, events, forward, icon }
//        discord.<route>  "https://discord.com/api/webhooks/…"   (a rotated webhook without touching .env)
//        dedup            { window_sec }
//        geoip            { enabled, map, zoom }
//        enrich           { github, tmdb_api_key, omdb_api_key }

const { WEBHOOK_RE } = require('./config');

const ROUTE_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const SOURCE_KEYS = ['route', 'dedup_window_sec', 'events', 'forward', 'icon'];

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function bad(msg) { const e = new Error(msg); e.status = 400; return e; }

/** Validate and normalise a sources.<name> override. Returns the cleaned object. */
function validateSource(input, config, knownEvents = []) {
  if (!input || typeof input !== 'object') throw bad('body must be an object');
  const out = {};
  if (input.route !== undefined) {
    const r = String(input.route).trim();
    if (r !== 'auto' && !config.discord[r]) throw bad(`unknown route: ${r}`);
    out.route = r;
  }
  if (input.dedup_window_sec !== undefined && input.dedup_window_sec !== null && input.dedup_window_sec !== '') {
    const n = Number(input.dedup_window_sec);
    if (!Number.isFinite(n) || n < 0 || n > 31 * 86400) throw bad('dedup_window_sec must be 0..2678400');
    out.dedup_window_sec = Math.round(n);
  }
  if (input.events !== undefined) {
    if (input.events === null) out.events = {};
    else {
      if (typeof input.events !== 'object' || Array.isArray(input.events)) throw bad('events must be an object');
      const ev = {};
      for (const [name, target] of Object.entries(input.events)) {
        if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) throw bad(`bad event name: ${name}`);
        if (target === null || target === undefined || target === '' || target === 'default') continue;
        const t = String(target).trim();
        if (t !== 'off' && !config.discord[t]) throw bad(`event ${name}: unknown route ${t}`);
        ev[name] = t;
      }
      out.events = ev;
    }
  }
  if (input.forward !== undefined) {
    const list = Array.isArray(input.forward) ? input.forward : String(input.forward || '').split(/[\n,]/);
    const urls = list.map(s => String(s).trim()).filter(Boolean);
    for (const u of urls) if (!/^https?:\/\/[^\s]+$/i.test(u)) throw bad(`forward target is not an http(s) URL: ${u}`);
    out.forward = urls;
  }
  if (input.icon !== undefined) {
    const i = String(input.icon || '').trim();
    if (i && !/^https?:\/\/[^\s]+$/i.test(i)) throw bad('icon must be an http(s) URL or empty');
    out.icon = i;
  }
  void knownEvents;
  return out;
}

function validateWebhook(url) {
  const u = String(url || '').trim();
  if (!WEBHOOK_RE.test(u)) throw bad('not a Discord webhook URL (https://discord.com/api/webhooks/ID/TOKEN)');
  return u;
}

function validateRouteName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!ROUTE_NAME.test(n)) throw bad('route name: lowercase letters, digits, - or _, max 32 chars');
  return n;
}

/**
 * Holds the file/env baseline and applies DB overrides on top, in place (the sender and dedup hold
 * references to config.discord / config.sources, so mutation is what keeps them live).
 */
class Settings {
  constructor({ config, store, log, services = {}, dedup } = {}) {
    this.config = config;
    this.store = store;
    this.log = log || { info() {}, warn() {} };
    this.services = services;
    this.dedup = dedup;
    for (const k of ['sources', 'discord', 'dedup', 'geoip', 'enrich']) if (!config[k] || typeof config[k] !== 'object') config[k] = {};
    this.base = { sources: clone(config.sources), discord: clone(config.discord), dedup: clone(config.dedup), geoip: clone(config.geoip), enrich: clone(config.enrich) };
    this.values = {};
  }

  async load() {
    if (!this.store || !this.store.enabled) return this;
    try {
      this.values = await this.store.loadSettings();
    } catch (err) {
      this.log.warn('settings load failed, using config.json only', { error: err.message });
      this.values = {};
    }
    for (const [key, value] of Object.entries(this.values)) this._apply(key, value);
    const n = Object.keys(this.values).length;
    if (n) this.log.info('settings applied from database', { keys: n });
    return this;
  }

  overridden(key) { return Object.prototype.hasOwnProperty.call(this.values, key); }

  _apply(key, value) {
    const cfg = this.config;
    if (key.startsWith('sources.')) {
      const name = key.slice(8);
      const baseline = clone(this.base.sources[name]) || {};
      cfg.sources[name] = { ...baseline, ...(value || {}) };
    } else if (key.startsWith('discord.')) {
      const route = key.slice(8);
      if (value) cfg.discord[route] = value; else delete cfg.discord[route];
    } else if (key === 'dedup') {
      Object.assign(cfg.dedup, value || {});
      if (this.dedup && value && value.window_sec !== undefined) this.dedup.windowSec = Number(value.window_sec);
    } else if (key === 'geoip') {
      Object.assign(cfg.geoip, value || {});
      if (this.services.geoip && value && value.enabled !== undefined) this.services.geoip.enabled = !!value.enabled;
    } else if (key === 'enrich') {
      Object.assign(cfg.enrich, value || {});
      const en = this.services.enrich;
      if (en) {
        if (value.tmdb_api_key !== undefined) en.tmdbKey = value.tmdb_api_key || null;
        if (value.omdb_api_key !== undefined) en.omdbKey = value.omdb_api_key || null;
        if (value.mdblist_api_key !== undefined) en.mdblistKey = value.mdblist_api_key || null;
        if (value.github !== undefined) en.github = !!value.github;
      }
    }
  }

  _revert(key) {
    const cfg = this.config;
    if (key.startsWith('sources.')) {
      const name = key.slice(8);
      if (this.base.sources[name]) cfg.sources[name] = clone(this.base.sources[name]); else delete cfg.sources[name];
    } else if (key.startsWith('discord.')) {
      const route = key.slice(8);
      if (this.base.discord[route]) cfg.discord[route] = this.base.discord[route]; else delete cfg.discord[route];
    } else if (key === 'dedup') {
      Object.assign(cfg.dedup, clone(this.base.dedup));
      if (this.dedup) this.dedup.windowSec = Number(cfg.dedup.window_sec);
    } else if (key === 'geoip') {
      Object.assign(cfg.geoip, clone(this.base.geoip));
      if (this.services.geoip) this.services.geoip.enabled = cfg.geoip.enabled !== false;
    } else if (key === 'enrich') {
      Object.assign(cfg.enrich, clone(this.base.enrich));
      const en = this.services.enrich;
      if (en) { en.tmdbKey = cfg.enrich.tmdb_api_key || null; en.omdbKey = cfg.enrich.omdb_api_key || null; en.mdblistKey = cfg.enrich.mdblist_api_key || null; en.github = cfg.enrich.github !== false; }
    }
  }

  /** Save (and apply) an override. Without a database the change is applied for this process only. */
  async set(key, value) {
    if (this.store && this.store.enabled) await this.store.putSetting(key, value);
    this.values[key] = value;
    this._apply(key, value);
    this.log.info('setting saved', { key, persisted: !!(this.store && this.store.enabled) });
  }

  async unset(key) {
    if (this.store && this.store.enabled) await this.store.deleteSetting(key);
    delete this.values[key];
    this._revert(key);
    this.log.info('setting removed', { key });
  }
}

module.exports = { Settings, validateSource, validateWebhook, validateRouteName, ROUTE_NAME, SOURCE_KEYS };
