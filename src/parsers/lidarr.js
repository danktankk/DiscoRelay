const { getImageUrl, formatQuality, formatSize } = require('../utils');

module.exports = {
  name: 'Lidarr',
  parse(body, config) {
    const event = body.eventType || 'Unknown';
    const artist = body.artist || {};
    const album = body.album || {};
    const release = body.release || {};
    const tracks = body.tracks || [];
    const title = artist.artistName || 'Unknown Artist';
    const albumTitle = album.title || '';

    const artistImages = artist.images || [];
    const albumImages = album.images || [];
    const albumCover = getImageUrl(albumImages, 'cover') || getImageUrl(albumImages, 'poster');
    const artistPoster = getImageUrl(artistImages, 'poster') || getImageUrl(artistImages, 'banner');
    const poster = albumCover || artistPoster;

    const quality = formatQuality(release.quality);
    const size = formatSize(release.size);

    const icons = { Grab: '📥', Download: '✅', Rename: '📝', AlbumDelete: '🗑️', ArtistDelete: '🗑️', Retag: '🏷️', Health: '⚠️', Test: '🧪' };
    const icon = icons[event] || '🎵';

    const fields = [];
    if (albumTitle) fields.push({ name: 'Album', value: albumTitle, inline: true });
    if (quality) fields.push({ name: 'Quality', value: quality, inline: true });
    if (size) fields.push({ name: 'Size', value: size, inline: true });
    if (tracks.length) fields.push({ name: 'Tracks', value: String(tracks.length), inline: true });

    const sourceIcon = config.sources?.lidarr?.icon || '';

    return [{
      author: sourceIcon ? { name: 'Lidarr', icon_url: sourceIcon } : undefined,
      title: `${icon} ${title}${albumTitle ? ' — ' + albumTitle : ''}`,
      description: event === 'AlbumDelete' ? '🗑️ Album removed from library' : undefined,
      color: parseInt((config.sources?.lidarr?.color || '#00FF00').replace('#', ''), 16),
      fields,
      thumbnail: poster ? { url: poster } : undefined,
      footer: { text: event },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
