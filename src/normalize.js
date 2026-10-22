'use strict';

const MAX_EMBEDS_PER_MESSAGE = 10;
const MAX_CHARS_PER_MESSAGE = 6000;

/** Remove undefined/null/empty-string values and empty objects — Discord rejects them. */
function clean(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v === undefined || v === null || v === '') {
      delete obj[key];
    } else if (Array.isArray(v)) {
      v.forEach(clean);
    } else if (typeof v === 'object') {
      clean(v);
      if (Object.keys(v).length === 0) delete obj[key];
    }
  }
  return obj;
}

function embedChars(e) {
  let n = 0;
  n += (e.title || '').length + (e.description || '').length;
  n += ((e.footer && e.footer.text) || '').length + ((e.author && e.author.name) || '').length;
  for (const f of e.fields || []) n += String(f.name || '').length + String(f.value || '').length;
  return n;
}

/**
 * Turn a parser result into Discord webhook payloads grouped by route.
 * A parser returns either an array of embeds (each may carry `route`) or
 * `{ payloads: [{ route, body }] }` where body is a ready Discord webhook body.
 */
function toPayloads(result, defaultRoute = 'daily', sourceCfg = null) {
  if (result && Array.isArray(result.payloads)) {
    return result.payloads
      .filter(p => p && p.body)
      .map(p => ({ route: p.route || defaultRoute, body: p.body }));
  }
  const embeds = Array.isArray(result) ? result.filter(Boolean) : [];
  const overrides = sourceCfg && sourceCfg.events && typeof sourceCfg.events === 'object' ? sourceCfg.events : null;
  const groups = [];
  let cur = null;
  for (const embed of embeds) {
    let route = embed.route || defaultRoute;
    const event = embed.event;
    delete embed.route;
    delete embed.event;
    // Per-event routing from config/admin: sources.<s>.events = { Grab: 'daily', Health: 'off' }
    if (event && overrides && overrides[event] !== undefined && overrides[event] !== null && overrides[event] !== '') {
      const o = overrides[event];
      if (o === 'off' || o === false) continue;
      route = String(o);
    }
    clean(embed);
    const chars = embedChars(embed);
    if (!cur || cur.route !== route || cur.body.embeds.length >= MAX_EMBEDS_PER_MESSAGE || cur.chars + chars > MAX_CHARS_PER_MESSAGE) {
      cur = { route, chars: 0, body: { embeds: [] } };
      groups.push(cur);
    }
    cur.body.embeds.push(embed);
    cur.chars += chars;
  }
  return groups.map(({ route, body }) => ({ route, body }));
}

function firstTitle(body) {
  if (!body) return null;
  const e = Array.isArray(body.embeds) && body.embeds[0];
  if (e && (e.title || e.description)) return String(e.title || e.description).slice(0, 200);
  if (typeof body.content === 'string') return body.content.slice(0, 200);
  return null;
}

module.exports = { toPayloads, clean, firstTitle, MAX_EMBEDS_PER_MESSAGE, MAX_CHARS_PER_MESSAGE };
