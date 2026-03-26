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
    
    const images = artist.images || [];
    const poster = images.find(i => i.coverType === 'poster' || i.coverType === 'banner')?.remoteUrl || '';
    const albumImages = album.images || [];
    const albumCover = albumImages.find(i => i.coverType === 'cover')?.remoteUrl || '';
    
    const quality = release.quality || '';
    const size = release.size ? `${(release.size / 1073741824).toFixed(1)} GB` : '';
    
    const icons = { Grab: '📥', Download: '✅', Rename: '📝', AlbumDelete: '🗑️', ArtistDelete: '🗑️', Retag: '🏷️', Health: '⚠️', Test: '🧪' };
    const icon = icons[event] || '🎵';
    
    const fields = [];
    if (albumTitle) fields.push({ name: 'Album', value: albumTitle, inline: true });
    if (quality) fields.push({ name: 'Quality', value: String(quality), inline: true });
    if (size) fields.push({ name: 'Size', value: size, inline: true });
    if (tracks.length) fields.push({ name: 'Tracks', value: String(tracks.length), inline: true });
    
    return [{
      title: `${icon} ${title}${albumTitle ? ' — ' + albumTitle : ''}`,
      description: event === 'AlbumDelete' ? '🗑️ Album removed from library' : '',
      color: parseInt((config.sources?.lidarr?.color || '#00FF00').replace('#', ''), 16),
      fields,
      thumbnail: { url: config.sources?.lidarr?.icon || '' },
      image: (albumCover || poster) ? { url: albumCover || poster } : undefined,
      footer: { text: `Lidarr • ${event}` },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
