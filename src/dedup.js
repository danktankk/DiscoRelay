'use strict';

const crypto = require('crypto');

// Keys that change on every send and must not affect the fingerprint.
const VOLATILE = new Set(['timestamp', 'footer']);

function stableCopy(value) {
  if (Array.isArray(value)) return value.map(stableCopy);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE.has(key)) continue;
      out[key] = stableCopy(value[key]);
    }
    return out;
  }
  return value;
}

function fingerprint(source, body) {
  return crypto.createHash('sha1').update(source + '\n' + JSON.stringify(stableCopy(body))).digest('hex');
}

/**
 * At-most-once-per-window suppression keyed on (source, fingerprint).
 * The window is fixed, not sliding: a repeating alert still gets through once per window.
 */
class Dedup {
  constructor({ windowSec = 300, maxEntries = 5000, now = Date.now } = {}) {
    this.windowSec = windowSec;
    this.maxEntries = maxEntries;
    this.now = now;
    this.seen = new Map();
  }

  windowFor(config, source) {
    const s = config && config.sources && config.sources[source];
    if (s && s.dedup_window_sec !== undefined && s.dedup_window_sec !== null) return Number(s.dedup_window_sec);
    return this.windowSec;
  }

  check(source, fp, windowSec = this.windowSec) {
    if (!windowSec || windowSec <= 0) return { suppressed: false };
    const t = this.now();
    const key = source + ':' + fp;
    const prev = this.seen.get(key);
    if (prev && t - prev.ts < windowSec * 1000) {
      prev.count += 1;
      return { suppressed: true, count: prev.count, ageMs: t - prev.ts };
    }
    this.seen.set(key, { ts: t, count: 1 });
    this.prune(t);
    return { suppressed: false };
  }

  prune(t = this.now()) {
    if (this.seen.size <= this.maxEntries) return;
    const horizon = this.windowSec * 1000 * 2;
    for (const [key, v] of this.seen) {
      if (this.seen.size <= this.maxEntries) break;
      if (t - v.ts > horizon) this.seen.delete(key);
    }
    // Still too big (many distinct keys inside the window): drop oldest first.
    while (this.seen.size > this.maxEntries) {
      const oldest = this.seen.keys().next().value;
      this.seen.delete(oldest);
    }
  }
}

module.exports = { Dedup, fingerprint, stableCopy };
