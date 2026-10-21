'use strict';

// GeoIP enrichment for CrowdSec-style notifications. Provider: ip-api.com (free, non-commercial,
// 45 requests/minute, HTTP only). Results are cached; private/reserved addresses are never looked up.

const PRIVATE = [
  /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./, /^169\.254\./, /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^fc/i, /^fd/i, /^fe80/i,
];

function isPrivate(ip) {
  return PRIVATE.some(rx => rx.test(ip));
}

/** Slippy-map tile that contains lat/lon at the given zoom (OpenStreetMap standard tiles). */
function osmTile(lat, lon, zoom = 10) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

class GeoIP {
  constructor({ enabled = true, ttlMs = 24 * 3600 * 1000, maxEntries = 5000, perMinute = 40, timeoutMs = 5000, fetchImpl, metrics, log, now = Date.now } = {}) {
    this.enabled = enabled;
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.perMinute = perMinute;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl || globalThis.fetch;
    this.metrics = metrics;
    this.log = log || { warn() {}, debug() {} };
    this.now = now;
    this.cache = new Map();
    this.window = [];
  }

  _allow() {
    const t = this.now();
    this.window = this.window.filter(ts => t - ts < 60000);
    if (this.window.length >= this.perMinute) return false;
    this.window.push(t);
    return true;
  }

  /** Returns { country, region, city, isp, org, as, lat, lon } or null. Never throws. */
  async lookup(ip) {
    if (!this.enabled || !ip || isPrivate(ip)) return null;
    const hit = this.cache.get(ip);
    if (hit && this.now() - hit.ts < this.ttlMs) {
      this.metrics && this.metrics.inc('geoip_total', { outcome: 'cache' });
      return hit.value;
    }
    if (!this._allow()) {
      this.metrics && this.metrics.inc('geoip_total', { outcome: 'rate_limited' });
      return null;
    }
    try {
      const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,regionName,city,isp,org,as,lat,lon`;
      const res = await this.fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        this.metrics && this.metrics.inc('geoip_total', { outcome: 'miss' });
        this._remember(ip, null);
        return null;
      }
      const value = { country: data.country, region: data.regionName, city: data.city, isp: data.isp, org: data.org, as: data.as, lat: data.lat, lon: data.lon };
      this._remember(ip, value);
      this.metrics && this.metrics.inc('geoip_total', { outcome: 'ok' });
      return value;
    } catch (err) {
      this.metrics && this.metrics.inc('geoip_total', { outcome: 'error' });
      this.log.warn('geoip lookup failed', { ip, error: err && err.message });
      return null;
    }
  }

  _remember(ip, value) {
    if (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(ip, { ts: this.now(), value });
  }
}

module.exports = { GeoIP, isPrivate, osmTile };
