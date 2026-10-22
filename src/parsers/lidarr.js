const { getImageUrl, formatQuality, formatSize, etTime } = require('../utils');
const arr = require('../arr');

// Lidarr webhook (Settings → Connect → Webhook, JSON).
const APP = 'Lidarr';

module.exports = {
  name: APP,
  events: ['Grab', 'Download', 'Upgrade', 'ArtistAdd', 'AlbumDelete', 'ArtistDelete', 'Rename', 'Retag', 'TrackRetag', 'Health', 'HealthRestored', 'ApplicationUpdate', 'Test'],
  async parse(body, config, ctx = {}) {
    if (!body || typeof body !== 'object') throw new Error('body must be a Lidarr webhook JSON object');
    const cfg = (config.sources && config.sources.lidarr) || {};
    const icon = cfg.icon || '';
    const event = body.eventType || 'Unknown';
    const route = cfg.route && cfg.route !== 'auto' ? cfg.route : 'media';
    const APP_I = body.instanceName && String(body.instanceName).trim() && String(body.instanceName).trim() !== APP ? String(body.instanceName).trim() : APP;

    if (event === 'ApplicationUpdate') {
      const enrich = ctx.services && ctx.services.enrich;
      const notes = enrich ? await enrich.release('lidarr', body.newVersion) : null;
      return [arr.appUpdateEmbed({ app: APP_I, icon, body, notes, route: 'updates' })];
    }
    if (event === 'Health' || event === 'HealthRestored') return [arr.healthEmbed({ app: APP_I, icon, body, event })];

    const info = arr.eventInfo(event, body.isUpgrade);
    const artist = body.artist || {};
    const album = body.album || {};
    const release = body.release || {};
    const tracks = Array.isArray(body.tracks) ? body.tracks : [];
    const trackFiles = Array.isArray(body.trackFiles) ? body.trackFiles : [];
    const artistName = artist.name || artist.artistName || 'Unknown Artist';
    const albumTitle = album.title || '';
    const albumYear = album.releaseDate ? String(album.releaseDate).slice(0, 4) : '';
    const cover = getImageUrl(album.images || [], 'cover') || getImageUrl(artist.images || [], 'poster') || getImageUrl(artist.images || [], 'fanart');
    const fanart = getImageUrl(artist.images || [], 'fanart');
    const quality = formatQuality(release.quality || (trackFiles[0] && trackFiles[0].quality));
    const size = formatSize(release.size || trackFiles.reduce((n, f) => n + (f.size || 0), 0));
    const releaseTitle = release.releaseTitle || (trackFiles[0] && trackFiles[0].sceneName) || '';

    const fields = [];
    arr.triplet(fields, [['Artist', artistName], ['Type', album.albumType || album.type], ['Quality', quality]]);
    arr.triplet(fields, [['Size', size], ['Tracks', tracks.length || trackFiles.length || ''], ['Release Group', release.releaseGroup]]);
    if (album.overview || artist.overview) fields.push({ name: 'Overview', value: String(album.overview || artist.overview).slice(0, 600), inline: false });
    const genres = (album.genres || artist.genres || []);
    if (genres.length) fields.push({ name: 'Genres', value: genres.join(', '), inline: true });
    const linkLine = arr.links([
      { name: 'MusicBrainz', url: album.mbId ? `https://musicbrainz.org/release-group/${album.mbId}` : artist.mbId ? `https://musicbrainz.org/artist/${artist.mbId}` : '' },
    ]);
    if (linkLine) fields.push({ name: 'Links', value: linkLine, inline: true });
    arr.triplet(fields, [['Indexer', release.indexer], ['Download Client', body.downloadClient]]);
    const cf = arr.customFormatsBlock(body.customFormatInfo, release);
    if (cf) fields.push({ name: 'Custom Formats', value: cf, inline: false });
    if (releaseTitle && ['Grab', 'Download', 'Upgrade'].includes(info.key)) fields.push({ name: 'Release', value: '`' + String(releaseTitle).slice(0, 200) + '`', inline: false });
    if (event === 'AlbumDelete' || event === 'ArtistDelete') arr.triplet(fields, [['Files deleted', body.deletedFiles ? 'yes' : 'no']]);

    return [{
      event: info.key,
      author: arr.author(APP_I, info.label, icon),
      title: `${albumTitle || artistName}${albumYear ? ` (${albumYear})` : ''}`.slice(0, 256),
      url: album.mbId ? `https://musicbrainz.org/release-group/${album.mbId}` : undefined,
      color: info.color,
      fields,
      thumbnail: cover ? { url: cover } : undefined,
      image: fanart && ['Grab', 'Download', 'Upgrade'].includes(info.key) ? { url: fanart } : undefined,
      footer: { text: etTime() },
      timestamp: new Date().toISOString(),
      route,
    }];
  },
};
