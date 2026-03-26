module.exports = {
  name: 'Radarr',
  parse(body, config) {
    const event = body.eventType || 'Unknown';
    const movie = body.movie || body.remoteMovie || {};
    const release = body.release || {};
    const title = movie.title || 'Unknown Movie';
    const year = movie.year || '';
    const quality = release.quality || body.movieFile?.quality || '';
    const size = release.size ? `${(release.size / 1073741824).toFixed(1)} GB` : '';
    const overview = movie.overview || '';
    const tmdbId = movie.tmdbId || body.remoteMovie?.tmdbId || '';
    const imdbId = movie.imdbId || body.remoteMovie?.imdbId || '';
    
    // Try to get poster
    const images = movie.images || [];
    const poster = images.find(i => i.coverType === 'poster')?.remoteUrl || '';
    const fanart = images.find(i => i.coverType === 'fanart')?.remoteUrl || '';
    
    const icons = { Grab: '📥', Download: '✅', Rename: '📝', MovieDelete: '🗑️', MovieFileDelete: '🗑️', Health: '⚠️', Test: '🧪' };
    const icon = icons[event] || '🎬';
    
    const fields = [];
    if (quality) fields.push({ name: 'Quality', value: String(quality), inline: true });
    if (size) fields.push({ name: 'Size', value: size, inline: true });
    if (release.indexer) fields.push({ name: 'Indexer', value: release.indexer, inline: true });
    
    const links = [];
    if (tmdbId) links.push(`[TMDB](https://www.themoviedb.org/movie/${tmdbId})`);
    if (imdbId) links.push(`[IMDb](https://www.imdb.com/title/${imdbId})`);
    
    const desc = [overview.substring(0, 200)];
    if (links.length) desc.push(links.join(' • '));
    
    return [{
      title: `${icon} ${title} (${year})`,
      url: tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : undefined,
      description: desc.filter(Boolean).join('\n\n'),
      color: parseInt((config.sources?.radarr?.color || '#FFA500').replace('#', ''), 16),
      fields,
      thumbnail: { url: config.sources?.radarr?.icon || '' },
      image: poster ? { url: poster } : undefined,
      footer: { text: `Radarr • ${event}` },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
