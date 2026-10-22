'use strict';

// Metadata enrichment for the *arr parsers, the part of the Notifiarr look that the webhook payload
// itself cannot provide: ratings, certification, runtime, awards, networks and release changelogs.
//
// Providers (all optional, all free tier, all cached, none ever throws):
//   TMDb    https://api.themoviedb.org   TMDB_API_KEY   movie/series details, certification, runtime, vote average
//   OMDb    https://www.omdbapi.com      OMDB_API_KEY   IMDb/RT/Metacritic ratings, MPAA rating, awards (1000 req/day free)
//   GitHub  https://api.github.com       no key         release notes for ApplicationUpdate events (60 req/h unauthenticated)

const RELEASE_REPOS = {
  radarr: 'Radarr/Radarr',
  sonarr: 'Sonarr/Sonarr',
  lidarr: 'Lidarr/Lidarr',
  readarr: 'Readarr/Readarr',
  prowlarr: 'Prowlarr/Prowlarr',
};

/**
 * Parse a *arr GitHub release body into { new: [], fixed: [], other: [] }.
 * Real bodies look like "## Changes:" followed by "* <commit sha> Fixed: …" / "* <sha> New: …" / "* <sha> plain"
 * (Radarr, Lidarr) or "### Changes" + "* Fixed: … by @user in <pr url>" (Sonarr). Section headings
 * named New/Fixed are honoured too. Translation/version-bump/API-docs noise is dropped.
 */
function parseReleaseNotes(body) {
  const out = { new: [], fixed: [], other: [] };
  if (!body || typeof body !== 'string') return out;
  let section = 'other';
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(?:#+\s*|\*\*)?\s*(new|added|features?|fixed|fixes|bug ?fixes|changed|changes|other|improvements?)\b[\s:*]*$/i.exec(line);
    if (heading) {
      const h = heading[1].toLowerCase();
      section = /^(new|added|feature)/.test(h) ? 'new' : /^(fix|bug)/.test(h) ? 'fixed' : 'other';
      continue;
    }
    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (!item) continue;
    let text = item[1]
      .replace(/^[0-9a-f]{7,40}\s+/i, '')                 // leading commit sha
      .replace(/\s+by\s+@[\w-]+\s+in\s+https?:\S+$/i, '')  // "by @user in <pr>"
      .replace(/\s*\(#\d+\)\s*$/, '')
      .replace(/\s*\[\s*#\d+\s*\]\s*$/, '')
      .replace(/^\*\*(.+?)\*\*:?\s*/, '$1: ')
      .trim();
    if (!text) continue;
    if (/^(multiple translations updated|automated api docs update|bump (to|version)|update translations?)/i.test(text)) continue;
    let target = section;
    const tagged = /^(new|added|fixed|fix|changed|removed)\s*:\s*(.*)$/i.exec(text);
    if (tagged) {
      const tag = tagged[1].toLowerCase();
      target = /^(new|added)/.test(tag) ? 'new' : /^fix/.test(tag) ? 'fixed' : 'other';
      text = tagged[2].trim() || text;
    }
    out[target].push(text);
  }
  return out;
}

class Enricher {
  constructor({ tmdbKey, omdbKey, github = true, fetchImpl, metrics, log, now = Date.now, timeoutMs = 6000, ttlMs = 24 * 3600 * 1000, maxEntries = 2000 } = {}) {
    this.tmdbKey = tmdbKey || null;
    this.omdbKey = omdbKey || null;
    this.github = github !== false;
    this.fetch = fetchImpl || globalThis.fetch;
    this.metrics = metrics;
    this.log = log || { warn() {}, debug() {} };
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.cache = new Map();
  }

  get providers() {
    return { tmdb: !!this.tmdbKey, omdb: !!this.omdbKey, github: this.github };
  }

  _cached(key) {
    const hit = this.cache.get(key);
    if (hit && hit.until > this.now()) return hit.value;
    return undefined;
  }

  _remember(key, value, ttl = this.ttlMs) {
    if (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, { value, until: this.now() + ttl });
    return value;
  }

  async _json(provider, url, headers = {}) {
    try {
      const res = await this.fetch(url, { headers: { accept: 'application/json', 'user-agent': 'DiscoRelay', ...headers }, signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) {
        if (this.metrics) this.metrics.inc('enrich_total', { provider, outcome: `http_${res.status}` });
        return null;
      }
      const data = await res.json();
      if (this.metrics) this.metrics.inc('enrich_total', { provider, outcome: 'ok' });
      return data;
    } catch (err) {
      if (this.metrics) this.metrics.inc('enrich_total', { provider, outcome: 'error' });
      this.log.warn('enrichment failed', { provider, error: err && err.message });
      return null;
    }
  }

  /** Movie details: { runtime, certification, tagline, status, studio, ratings: { tmdb, imdb, rt, metacritic }, awards }. */
  async movie({ tmdbId, imdbId } = {}) {
    const key = `movie:${tmdbId || ''}:${imdbId || ''}`;
    const hit = this._cached(key);
    if (hit !== undefined) return hit;
    const out = { ratings: {} };
    if (this.tmdbKey && tmdbId) {
      const d = await this._json('tmdb', `https://api.themoviedb.org/3/movie/${encodeURIComponent(tmdbId)}?api_key=${this.tmdbKey}&append_to_response=release_dates`);
      if (d) {
        if (d.runtime) out.runtime = d.runtime;
        if (d.vote_average) out.ratings.tmdb = Number(d.vote_average).toFixed(1);
        if (d.tagline) out.tagline = d.tagline;
        if (d.status) out.status = d.status;
        if (Array.isArray(d.production_companies) && d.production_companies[0]) out.studio = d.production_companies[0].name;
        const us = d.release_dates && Array.isArray(d.release_dates.results) ? d.release_dates.results.find(r => r.iso_3166_1 === 'US') : null;
        const cert = us && Array.isArray(us.release_dates) ? us.release_dates.map(r => r.certification).find(Boolean) : '';
        if (cert) out.certification = cert;
        if (!imdbId && d.imdb_id) imdbId = d.imdb_id;
      }
    }
    if (this.omdbKey && imdbId) Object.assign(out, await this._omdb(imdbId, out));
    return this._remember(key, Object.keys(out.ratings).length || Object.keys(out).length > 1 ? out : null);
  }

  /** Series details: { network, certification, status, runtime, ratings: { tmdb, imdb }, awards }. */
  async series({ tmdbId, imdbId } = {}) {
    const key = `series:${tmdbId || ''}:${imdbId || ''}`;
    const hit = this._cached(key);
    if (hit !== undefined) return hit;
    const out = { ratings: {} };
    if (this.tmdbKey && tmdbId) {
      const d = await this._json('tmdb', `https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}?api_key=${this.tmdbKey}&append_to_response=content_ratings,external_ids`);
      if (d) {
        if (Array.isArray(d.networks) && d.networks[0]) out.network = d.networks[0].name;
        if (d.vote_average) out.ratings.tmdb = Number(d.vote_average).toFixed(1);
        if (d.status) out.status = d.status;
        if (Array.isArray(d.episode_run_time) && d.episode_run_time[0]) out.runtime = d.episode_run_time[0];
        const us = d.content_ratings && Array.isArray(d.content_ratings.results) ? d.content_ratings.results.find(r => r.iso_3166_1 === 'US') : null;
        if (us && us.rating) out.certification = us.rating;
        if (!imdbId && d.external_ids && d.external_ids.imdb_id) imdbId = d.external_ids.imdb_id;
      }
    }
    if (this.omdbKey && imdbId) Object.assign(out, await this._omdb(imdbId, out));
    return this._remember(key, Object.keys(out.ratings).length || Object.keys(out).length > 1 ? out : null);
  }

  async _omdb(imdbId, base) {
    const d = await this._json('omdb', `https://www.omdbapi.com/?apikey=${this.omdbKey}&i=${encodeURIComponent(imdbId)}`);
    if (!d || d.Response === 'False') return {};
    const out = { ratings: { ...base.ratings } };
    const ok = v => v && v !== 'N/A';
    if (ok(d.imdbRating)) out.ratings.imdb = `${d.imdbRating}/10`;
    if (ok(d.Metascore)) out.ratings.metacritic = d.Metascore;
    for (const r of d.Ratings || []) if (r.Source === 'Rotten Tomatoes' && ok(r.Value)) out.ratings.rt = r.Value;
    if (ok(d.Rated) && !base.certification) out.certification = d.Rated;
    if (ok(d.Awards)) out.awards = d.Awards;
    if (ok(d.Runtime) && !base.runtime) { const m = parseInt(d.Runtime, 10); if (m) out.runtime = m; }
    return out;
  }

  /** Release notes for an ApplicationUpdate: { url, new: [], fixed: [], other: [] } or null. */
  async release(app, version) {
    const repo = RELEASE_REPOS[String(app || '').toLowerCase()];
    if (!this.github || !repo || !version) return null;
    const key = `release:${repo}:${version}`;
    const hit = this._cached(key);
    if (hit !== undefined) return hit;
    const tag = `v${String(version).replace(/^v/, '')}`;
    const d = await this._json('github', `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, { accept: 'application/vnd.github+json' });
    if (!d) return this._remember(key, null, 6 * 3600 * 1000);
    const notes = parseReleaseNotes(d.body);
    return this._remember(key, { url: d.html_url || `https://github.com/${repo}/releases/tag/${tag}`, ...notes }, 7 * 24 * 3600 * 1000);
  }
}

module.exports = { Enricher, parseReleaseNotes, RELEASE_REPOS };
