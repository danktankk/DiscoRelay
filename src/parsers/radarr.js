const { getImageUrl, formatQuality, formatSize, etTime } = require('../utils');
const arr = require('../arr');

// Radarr webhook (Settings → Connect → Webhook, JSON). Every event type Radarr emits is handled; the
// Grab/Import/Upgrade embeds follow Notifiarr's layout and are enriched with TMDb/OMDb data when the hub
// has keys (ratings, certification, runtime, awards). Each embed carries `event` so per-event routing works.
const APP = 'Radarr';

function tmdbUrl(id) { return id ? `https://www.themoviedb.org/movie/${id}` : ''; }

function languagesOf(release, movieFile, movie) {
  const rel = (Array.isArray(release.languages) && release.languages.length ? release.languages : movieFile.languages) || [];
  return arr.languagesBlock(movie.originalLanguage, rel);
}

module.exports = {
  name: APP,
  events: ['Grab', 'Download', 'Upgrade', 'MovieAdded', 'MovieDelete', 'MovieFileDelete', 'Rename', 'Health', 'HealthRestored', 'ApplicationUpdate', 'ManualInteractionRequired', 'Test'],
  async parse(body, config, ctx = {}) {
    if (!body || typeof body !== 'object') throw new Error('body must be a Radarr webhook JSON object');
    const cfg = (config.sources && config.sources.radarr) || {};
    const icon = cfg.icon || '';
    const event = body.eventType || 'Unknown';
    const route = cfg.route && cfg.route !== 'auto' ? cfg.route : 'media';
    const enrich = ctx.services && ctx.services.enrich;
    // Several instances (4K, 3D…) share one parser; the instance name set in Settings → General shows in the author line.
    const APP_I = body.instanceName && String(body.instanceName).trim() && String(body.instanceName).trim() !== APP ? String(body.instanceName).trim() : APP;

    if (event === 'ApplicationUpdate') {
      const notes = enrich ? await enrich.release('radarr', body.newVersion) : null;
      return [arr.appUpdateEmbed({ app: APP_I, icon, body, notes, route: 'updates' })];
    }
    if (event === 'Health' || event === 'HealthRestored') return [arr.healthEmbed({ app: APP_I, icon, body, event })];

    const movie = body.movie || body.remoteMovie || {};
    const title = movie.title || (body.remoteMovie && body.remoteMovie.title) || 'Unknown Movie';
    const year = movie.year || (body.remoteMovie && body.remoteMovie.year) || '';
    const subject = `${title}${year ? ` (${year})` : ''}`;
    const tmdbId = movie.tmdbId || (body.remoteMovie && body.remoteMovie.tmdbId) || '';
    const imdbId = movie.imdbId || (body.remoteMovie && body.remoteMovie.imdbId) || '';

    if (event === 'ManualInteractionRequired') return [arr.manualEmbed({ app: APP_I, icon, body, subject, route })];

    const info = arr.eventInfo(event, body.isUpgrade);
    const release = body.release || {};
    const movieFile = body.movieFile || {};
    const images = movie.images || [];
    const poster = getImageUrl(images, 'poster');
    const fanart = getImageUrl(images, 'fanart');

    // Enrichment is additive: whatever the payload carries wins, the providers fill the gaps.
    let meta = null;
    if (enrich && (tmdbId || imdbId) && ['Grab', 'Download', 'MovieAdded', 'Test'].includes(event)) meta = await enrich.movie({ tmdbId, imdbId });
    meta = meta || {};
    const ratings = { ...(meta.ratings || {}) };
    if (movie.ratings) {
      if (movie.ratings.tmdb && movie.ratings.tmdb.value && !ratings.tmdb) ratings.tmdb = Number(movie.ratings.tmdb.value).toFixed(1);
      if (movie.ratings.imdb && movie.ratings.imdb.value && !ratings.imdb) ratings.imdb = `${movie.ratings.imdb.value}/10`;
      if (movie.ratings.rottenTomatoes && movie.ratings.rottenTomatoes.value && !ratings.rt) ratings.rt = `${movie.ratings.rottenTomatoes.value}%`;
      if (movie.ratings.metacritic && movie.ratings.metacritic.value && !ratings.metacritic) ratings.metacritic = String(movie.ratings.metacritic.value);
    }
    const runtime = arr.fmtRuntime(movie.runtime || meta.runtime);
    const certification = movie.certification || meta.certification || '';
    const quality = formatQuality(release.quality || movieFile.quality);
    const size = formatSize(release.size || movieFile.size);
    const releaseTitle = release.releaseTitle || movieFile.sceneName || movieFile.relativePath || '';
    const languages = languagesOf(release, movieFile, movie);

    const fields = [];
    arr.triplet(fields, [['Rating', certification], ['Quality', quality], ['Runtime', runtime]]);
    arr.triplet(fields, [['Size', size], ['Release Group', release.releaseGroup || movieFile.releaseGroup], ['Studio', meta.studio]]);
    if (movie.overview) fields.push({ name: 'Overview', value: String(movie.overview).slice(0, 600), inline: false });
    const rl = arr.ratingsLine(ratings);
    if (rl) fields.push({ name: 'Ratings', value: rl, inline: false });
    if (meta.awards) fields.push({ name: 'Awards', value: meta.awards, inline: false });
    if (Array.isArray(movie.genres) && movie.genres.length) fields.push({ name: 'Genres', value: movie.genres.join(', '), inline: true });
    const linkLine = arr.links([
      { name: 'TMDb', url: tmdbUrl(tmdbId) },
      { name: 'IMDb', url: imdbId ? `https://www.imdb.com/title/${imdbId}` : '' },
      { name: 'Trakt', url: tmdbId ? `https://trakt.tv/search/tmdb/${tmdbId}?id_type=movie` : '' },
    ]);
    if (linkLine) fields.push({ name: 'Links', value: linkLine, inline: true });
    arr.triplet(fields, [['Indexer', release.indexer], ['Download Client', body.downloadClient]]);
    const mi = arr.mediaInfoLine(movieFile.mediaInfo);
    if (mi) fields.push({ name: 'Media Info', value: mi, inline: false });
    if (languages) fields.push({ name: 'Languages', value: languages, inline: false });
    const cf = arr.customFormatsBlock(body.customFormatInfo, release);
    if (cf) fields.push({ name: 'Custom Formats', value: cf, inline: false });
    if (releaseTitle && ['Grab', 'Download', 'Upgrade'].includes(info.key)) fields.push({ name: 'Release', value: '`' + String(releaseTitle).slice(0, 200) + '`', inline: false });

    if (event === 'MovieDelete') arr.triplet(fields, [['Files deleted', body.deletedFiles ? 'yes' : 'no'], ['Folder size', formatSize(body.movieFolderSize)]]);
    if (event === 'MovieFileDelete') arr.triplet(fields, [['Reason', body.deleteReason], ['File', movieFile.relativePath]]);
    if (event === 'MovieAdded') arr.triplet(fields, [['Added via', body.addMethod]]);
    if (event === 'Rename' && Array.isArray(body.renamedMovieFiles) && body.renamedMovieFiles.length) {
      fields.push({ name: 'Renamed', value: arr.codeBlock(body.renamedMovieFiles.slice(0, 6).map(f => `${f.previousRelativePath || '?'} → ${f.relativePath || '?'}`)), inline: false });
    }

    const description = meta.tagline && ['Grab', 'Download', 'MovieAdded'].includes(event) ? `*${meta.tagline}*` : undefined;

    return [{
      event: info.key,
      author: arr.author(APP_I, info.label, icon),
      title: subject.slice(0, 256),
      url: tmdbUrl(tmdbId) || undefined,
      description,
      color: info.color,
      fields,
      thumbnail: poster ? { url: poster } : undefined,
      image: fanart && ['Grab', 'Download', 'Upgrade', 'MovieAdded'].includes(info.key) ? { url: fanart } : undefined,
      footer: { text: etTime() },
      timestamp: new Date().toISOString(),
      route,
    }];
  },
};
