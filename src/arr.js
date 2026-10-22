'use strict';

// Shared building blocks for the Radarr / Sonarr / Lidarr parsers: the Notifiarr look, once.
const { etTime, formatSize } = require('./utils');

const COLORS = {
  grab: 0x3498DB, import: 0x2ECC71, upgrade: 0x1ABC9C, added: 0x1ABC9C, rename: 0x9B59B6, retag: 0x9B59B6,
  delete: 0xE74C3C, health: 0xF39C12, healthError: 0xDC2626, restored: 0x2ECC71, update: 0x3498DB,
  manual: 0xF59E0B, test: 0x95A5A6, unknown: 0xFFA500,
};

const EVENTS = {
  Grab: { label: 'Grabbed', color: COLORS.grab },
  Download: { label: 'Imported', color: COLORS.import },
  Upgrade: { label: 'Upgraded', color: COLORS.upgrade },
  Rename: { label: 'Renamed', color: COLORS.rename },
  Retag: { label: 'Retagged', color: COLORS.retag },
  MovieAdded: { label: 'Added', color: COLORS.added },
  SeriesAdd: { label: 'Added', color: COLORS.added },
  ArtistAdd: { label: 'Added', color: COLORS.added },
  MovieDelete: { label: 'Deleted', color: COLORS.delete },
  MovieFileDelete: { label: 'File Deleted', color: COLORS.delete },
  SeriesDelete: { label: 'Deleted', color: COLORS.delete },
  EpisodeFileDelete: { label: 'File Deleted', color: COLORS.delete },
  AlbumDelete: { label: 'Deleted', color: COLORS.delete },
  ArtistDelete: { label: 'Artist Deleted', color: COLORS.delete },
  TrackRetag: { label: 'Retagged', color: COLORS.retag },
  Health: { label: 'Health Check', color: COLORS.health },
  HealthRestored: { label: 'Health Restored', color: COLORS.restored },
  ApplicationUpdate: { label: 'Application Updated', color: COLORS.update },
  ManualInteractionRequired: { label: 'Manual Interaction Required', color: COLORS.manual },
  Test: { label: 'Test', color: COLORS.test },
};

function eventInfo(event, isUpgrade) {
  if (event === 'Download' && isUpgrade) return { key: 'Upgrade', ...EVENTS.Upgrade };
  const e = EVENTS[event];
  return e ? { key: event, ...e } : { key: event || 'Unknown', label: event || 'Unknown', color: COLORS.unknown };
}

function author(app, label, icon) {
  const name = `${label} — ${app}`;
  return icon ? { name, icon_url: icon } : { name };
}

function fmtRuntime(minutes) {
  const m = Number(minutes);
  if (!m || m <= 0) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

function ratingsLine(r = {}) {
  const parts = [];
  if (r.tmdb) parts.push(`TMDb: ${r.tmdb}`);
  if (r.imdb) parts.push(`IMDb: ${r.imdb}`);
  if (r.rt) parts.push(`RT: ${r.rt}`);
  if (r.metacritic) parts.push(`MC: ${r.metacritic}`);
  return parts.join(' • ');
}

function links(list) {
  return list.filter(l => l && l.url).map(l => `[${l.name}](${l.url})`).join(' • ');
}

function codeBlock(lines) {
  const body = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join('\n');
  return body ? '```\n' + body.slice(0, 1000) + '\n```' : '';
}

function numbered(items, max = 12) {
  const list = items.slice(0, max).map((t, i) => `${i + 1}. ${t}`);
  if (items.length > max) list.push(`… ${items.length - max} more`);
  return list;
}

function languagesBlock(original, releaseLangs) {
  const orig = original && (original.name || original);
  const rel = (Array.isArray(releaseLangs) ? releaseLangs : []).map(l => l && (l.name || l)).filter(Boolean);
  if (!orig && !rel.length) return '';
  const lines = [];
  if (orig) lines.push(`Original: ${orig}`);
  if (rel.length) lines.push(`Release: ${rel.join(', ')}`);
  return codeBlock(lines);
}

function customFormatsBlock(info, release) {
  const formats = (info && Array.isArray(info.customFormats) && info.customFormats.map(f => f && (f.name || f)).filter(Boolean))
    || (release && Array.isArray(release.customFormats) && release.customFormats.map(f => f && (f.name || f)).filter(Boolean)) || [];
  const score = info && info.customFormatScore != null ? info.customFormatScore : release && release.customFormatScore;
  if (!formats.length && score == null) return '';
  const lines = [];
  if (score != null) lines.push(`Score : ${score}`);
  if (formats.length) lines.push(`Format: ${formats.join(', ')}`);
  return codeBlock(lines);
}

function mediaInfoLine(mi) {
  if (!mi || typeof mi !== 'object') return '';
  const parts = [];
  if (mi.width && mi.height) parts.push(`${mi.width}x${mi.height}`);
  else if (mi.height) parts.push(`${mi.height}p`);
  if (mi.videoDynamicRangeType) parts.push(mi.videoDynamicRangeType);
  else if (mi.videoDynamicRange) parts.push(mi.videoDynamicRange);
  if (mi.videoCodec) parts.push(mi.videoCodec);
  const audio = [mi.audioCodec, mi.audioChannels ? String(mi.audioChannels) : ''].filter(Boolean).join(' ');
  if (audio) parts.push(audio);
  const subs = Array.isArray(mi.subtitles) ? mi.subtitles : (typeof mi.subtitles === 'string' ? mi.subtitles.split('/') : []);
  if (subs.length) parts.push(`subs: ${subs.slice(0, 6).join(', ')}${subs.length > 6 ? '…' : ''}`);
  return parts.join(' • ');
}

function triplet(fields, entries) {
  for (const [name, value] of entries) if (value) fields.push({ name, value: String(value), inline: true });
}

/** Radarr/Sonarr/Lidarr "ApplicationUpdate" rendered like Notifiarr: versions inline, New/Fixed numbered code blocks. */
function appUpdateEmbed({ app, icon, body, notes, route = 'updates' }) {
  const fields = [];
  triplet(fields, [['Old Version', body.previousVersion], ['New Version', body.newVersion], ['Branch', body.branch || (notes && notes.branch)]]);
  if (notes && notes.new && notes.new.length) fields.push({ name: 'New', value: codeBlock(numbered(notes.new)), inline: false });
  if (notes && notes.fixed && notes.fixed.length) fields.push({ name: 'Fixed', value: codeBlock(numbered(notes.fixed)), inline: false });
  if (notes && notes.other && notes.other.length) {
    const tagged = (notes.new && notes.new.length) || (notes.fixed && notes.fixed.length);
    fields.push({ name: tagged ? 'Other changes' : 'Changes', value: codeBlock(numbered(notes.other, tagged ? 6 : 12)), inline: false });
  }
  if (!fields.length && body.message) fields.push({ name: 'Message', value: String(body.message).slice(0, 1000), inline: false });
  return {
    event: 'ApplicationUpdate',
    author: author(app, EVENTS.ApplicationUpdate.label, icon),
    title: `${app} Application Updated - ${app}`,
    url: notes && notes.url ? notes.url : undefined,
    color: EVENTS.ApplicationUpdate.color,
    fields,
    footer: { text: etTime() },
    timestamp: new Date().toISOString(),
    route,
  };
}

/** Health / HealthRestored. */
function healthEmbed({ app, icon, body, event }) {
  const restored = event === 'HealthRestored';
  const level = String(body.level || (restored ? 'ok' : 'warning')).toLowerCase();
  const fields = [];
  triplet(fields, [['Level', level], ['Type', body.type]]);
  if (body.wikiUrl) fields.push({ name: 'Wiki', value: `[${String(body.type || 'help')}](${body.wikiUrl})`, inline: true });
  return {
    event,
    author: author(app, restored ? EVENTS.HealthRestored.label : EVENTS.Health.label, icon),
    title: restored ? `${app} health restored` : `${app} health ${level}`,
    description: body.message ? String(body.message).slice(0, 1500) : undefined,
    color: restored ? COLORS.restored : level === 'error' ? COLORS.healthError : COLORS.health,
    fields,
    footer: { text: etTime() },
    timestamp: new Date().toISOString(),
    route: restored ? 'daily' : level === 'error' ? 'warning' : 'daily',
  };
}

/** ManualInteractionRequired: a download the app could not import on its own. */
function manualEmbed({ app, icon, body, subject, route = 'media' }) {
  const info = body.downloadInfo || {};
  const fields = [];
  triplet(fields, [['Status', body.downloadStatus], ['Download Client', body.downloadClient], ['Quality', info.quality], ['Size', formatSize(info.size)]]);
  const msgs = [];
  for (const m of body.downloadStatusMessages || []) {
    if (!m) continue;
    const head = m.title ? `${m.title}: ` : '';
    for (const line of m.messages || []) msgs.push(head + line);
  }
  if (msgs.length) fields.push({ name: 'Messages', value: codeBlock(msgs.slice(0, 8)), inline: false });
  if (info.title) fields.push({ name: 'Release', value: '`' + String(info.title).slice(0, 200) + '`', inline: false });
  return {
    event: 'ManualInteractionRequired',
    author: author(app, EVENTS.ManualInteractionRequired.label, icon),
    title: subject || info.title || 'Manual interaction required',
    color: COLORS.manual,
    fields,
    footer: { text: etTime() },
    timestamp: new Date().toISOString(),
    route,
  };
}

module.exports = { EVENTS, COLORS, eventInfo, author, fmtRuntime, ratingsLine, links, codeBlock, numbered, languagesBlock, customFormatsBlock, mediaInfoLine, triplet, appUpdateEmbed, healthEmbed, manualEmbed };
