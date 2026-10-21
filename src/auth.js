'use strict';

const crypto = require('crypto');

function extractToken(req) {
  const header = req.get('x-relay-token');
  if (header) return header.trim();
  const authz = req.get('authorization');
  if (authz && /^bearer\s+/i.test(authz)) return authz.replace(/^bearer\s+/i, '').trim();
  if (typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return null;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function findScopes(tokens, presented) {
  let found = null;
  for (const [tok, scopes] of Object.entries(tokens)) {
    if (safeEqual(tok, presented)) found = scopes;
  }
  return found;
}

/**
 * Decide whether a request may act on `scope` (a source name, "admin" or "metrics").
 * A token with scope "*" may do anything.
 */
function authorize(config, req, scope) {
  if (!config.auth.required) return { ok: true, open: true };
  const presented = extractToken(req);
  if (!presented) return { ok: false, reason: 'missing_token' };
  const scopes = findScopes(config.auth.tokens, presented);
  if (!scopes) return { ok: false, reason: 'bad_token' };
  if (scopes.includes('*') || scopes.includes(scope)) return { ok: true };
  return { ok: false, reason: 'scope' };
}

module.exports = { authorize, extractToken };
