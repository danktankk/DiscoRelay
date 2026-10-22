const { getImageUrl, formatQuality, formatSize, etTime } = require('../utils');
const arr = require('../arr');

// Sonarr webhook (Settings → Connect → Webhook, JSON). Same layout as the Radarr parser; series
// metadata (network, ratings, certification) comes from TMDb/OMDb when the hub has keys.
const APP = 'Sonarr';

function epCode(e) { return `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`; }

function tvdbUrl(id) { return id ? `https://thetvdb.com/?id=${id}&tab=series` : ''; }

module.exports = {
  name: APP,
  events: ['Grab', 'Download', 'Upgrade', 'SeriesAdd', 'SeriesDelete', 'EpisodeFileDelete', 'Rename', 'Health', 'HealthRestored', 'ApplicationUpdate', 'ManualInteractionRequired', 'Test'],
  async parse(body, config, ctx = {}) {
    if (!body || typeof body !== 'object') throw new Error('body must be a Sonarr webhook JSON object');
    const cfg = (config.sources && config.sources.sonarr) || {};
    const icon = cfg.icon || '';
    const event = body.eventType || 'Unknown';
    const route = cfg.route && cfg.route !== 'auto' ? cfg.route : 'media';
    const enrich = ctx.services && ctx.services.enrich;
    const APP_I = body.instanceName && String(body.instanceName).trim() && String(body.instanceName).trim() !== APP ? String(body.instanceName).trim() : APP;

    if (event === 'ApplicationUpdate') {
      const notes = enrich ? await enrich.release('sonarr', body.newVersion) : null;
      return [arr.appUpdateEmbed({ app: APP_I, icon, body, notes, route: 'updates' })];
    }
    if (event === 'Health' || event === 'HealthRestored') return [arr.healthEmbed({ app: APP_I, icon, body, event })];

    const series = body.series || {};
    const episodes = Array.isArray(body.episodes) ? body.episodes : [];
    const codes = episodes.map(epCode);
    const epRange = codes.length > 3 ? `${codes[0]}–${codes[codes.length - 1]}` : codes.join(', ');
    const title = series.title || 'Unknown Series';
    const subject = `${title}${epRange ? ` (${epRange})` : series.year ? ` (${series.year})` : ''}`;
    const tvdbId = series.tvdbId || '';
    const tmdbId = series.tmdbId || '';
    const imdbId = series.imdbId || '';

    if (event === 'ManualInteractionRequired') return [arr.manualEmbed({ app: APP_I, icon, body, subject, route })];

    const info = arr.eventInfo(event, body.isUpgrade);
    const release = body.release || {};
    const file = body.episodeFile || (Array.isArray(body.episodeFiles) && body.episodeFiles[0]) || {};
    const images = series.images || [];
    const poster = getImageUrl(images, 'poster');
    const fanart = getImageUrl(images, 'fanart') || getImageUrl(images, 'banner');

    let meta = null;
    if (enrich && (tmdbId || imdbId) && ['Grab', 'Download', 'SeriesAdd', 'Test'].includes(event)) meta = await enrich.series({ tmdbId, imdbId });
    meta = meta || {};
    const ratings = { ...(meta.ratings || {}) };
    if (series.ratings && series.ratings.value && !ratings.imdb) ratings.imdb = `${series.ratings.value}/10`;
    const network = series.network || meta.network || '';
    const certification = series.certification || meta.certification || '';
    const quality = formatQuality(release.quality || file.quality);
    const size = formatSize(release.size || file.size);
    const releaseTitle = release.releaseTitle || file.sceneName || file.relativePath || '';
    const airDate = episodes[0] && episodes[0].airDate ? episodes[0].airDate : '';
    const epTitles = episodes.map(e => e.title).filter(Boolean);
    const epOverview = episodes.length === 1 && episodes[0].overview ? episodes[0].overview : '';

    const fields = [];
    if (epTitles.length) fields.push({ name: episodes.length > 1 ? 'Episodes' : 'Episode', value: episodes.map(e => `${epCode(e)}${e.title ? ' - ' + e.title : ''}`).slice(0, 10).join('\n'), inline: false });
    arr.triplet(fields, [['Rating', certification], ['Quality', quality], ['Air Date', airDate]]);
    arr.triplet(fields, [['Size', size], ['Network', network], ['Release Group', release.releaseGroup || file.releaseGroup]]);
    if (epOverview) fields.push({ name: 'Overview', value: String(epOverview).slice(0, 600), inline: false });
    const rl = arr.ratingsLine(ratings);
    if (rl) fields.push({ name: 'Ratings', value: rl, inline: false });
    if (meta.awards) fields.push({ name: 'Awards', value: meta.awards, inline: false });
    if (Array.isArray(series.genres) && series.genres.length) fields.push({ name: 'Genres', value: series.genres.join(', '), inline: true });
    const linkLine = arr.links([
      { name: 'TheTVDB', url: tvdbUrl(tvdbId) },
      { name: 'IMDb', url: imdbId ? `https://www.imdb.com/title/${imdbId}` : '' },
      { name: 'TMDb', url: tmdbId ? `https://www.themoviedb.org/tv/${tmdbId}` : '' },
      { name: 'Trakt', url: tvdbId ? `https://trakt.tv/search/tvdb/${tvdbId}?id_type=show` : '' },
    ]);
    if (linkLine) fields.push({ name: 'Links', value: linkLine, inline: true });
    arr.triplet(fields, [['Indexer', release.indexer], ['Download Client', body.downloadClient]]);
    const mi = arr.mediaInfoLine(file.mediaInfo);
    if (mi) fields.push({ name: 'Media Info', value: mi, inline: false });
    const languages = arr.languagesBlock(series.originalLanguage, (Array.isArray(release.languages) && release.languages.length ? release.languages : file.languages) || []);
    if (languages) fields.push({ name: 'Languages', value: languages, inline: false });
    const cf = arr.customFormatsBlock(body.customFormatInfo, release);
    if (cf) fields.push({ name: 'Custom Formats', value: cf, inline: false });
    if (releaseTitle && ['Grab', 'Download', 'Upgrade'].includes(info.key)) fields.push({ name: 'Release', value: '`' + String(releaseTitle).slice(0, 200) + '`', inline: false });

    if (event === 'SeriesDelete') arr.triplet(fields, [['Files deleted', body.deletedFiles ? 'yes' : 'no']]);
    if (event === 'EpisodeFileDelete') arr.triplet(fields, [['Reason', body.deleteReason], ['File', file.relativePath]]);
    if (event === 'SeriesAdd') arr.triplet(fields, [['Type', series.type], ['Year', series.year]]);
    if (event === 'Rename' && Array.isArray(body.renamedEpisodeFiles) && body.renamedEpisodeFiles.length) {
      fields.push({ name: 'Renamed', value: arr.codeBlock(body.renamedEpisodeFiles.slice(0, 6).map(f => `${f.previousRelativePath || '?'} → ${f.relativePath || '?'}`)), inline: false });
    }

    return [{
      event: info.key,
      author: arr.author(APP_I, info.label, icon),
      title: subject.slice(0, 256),
      url: tvdbUrl(tvdbId) || undefined,
      color: info.color,
      fields,
      thumbnail: poster ? { url: poster } : undefined,
      image: fanart && ['Grab', 'Download', 'Upgrade', 'SeriesAdd'].includes(info.key) ? { url: fanart } : undefined,
      footer: { text: etTime() },
      timestamp: new Date().toISOString(),
      route,
    }];
  },
};
