const { getImageUrl, formatQuality, formatSize } = require('../utils');

module.exports = {
  name: 'Radarr',
  parse(body, config) {
    const event = body.eventType || 'Unknown';
    const movie = body.movie || body.remoteMovie || {};
    const release = body.release || {};
    const title = movie.title || 'Unknown Movie';
    const year = movie.year || '';
    const quality = formatQuality(release.quality || body.movieFile?.quality);
    const size = formatSize(release.size || body.movieFile?.size);
    const overview = movie.overview || '';
    const tmdbId = movie.tmdbId || body.remoteMovie?.tmdbId || '';
    const imdbId = movie.imdbId || body.remoteMovie?.imdbId || '';

    // Poster image — try movie.images, fall back to TMDB poster URL
    const images = movie.images || [];
    let poster = getImageUrl(images, 'poster');
    if (!poster && tmdbId) {
      poster = `https://image.tmdb.org/t/p/w500/${tmdbId}.jpg`; // May not resolve, but worth trying
    }
    const fanart = getImageUrl(images, 'fanart');

    const icons = { Grab: '📥', Download: '✅', Rename: '📝', MovieDelete: '🗑️', MovieFileDelete: '🗑️', Health: '⚠️', Test: '🧪' };
    const icon = icons[event] || '🎬';

    const fields = [];
    if (quality) fields.push({ name: 'Quality', value: quality, inline: true });
    if (size) fields.push({ name: 'Size', value: size, inline: true });
    if (release.indexer) fields.push({ name: 'Indexer', value: release.indexer, inline: true });

    const links = [];
    if (tmdbId) links.push(`[TMDB](https://www.themoviedb.org/movie/${tmdbId})`);
    if (imdbId) links.push(`[IMDb](https://www.imdb.com/title/${imdbId})`);

    const desc = [overview.substring(0, 300)];
    if (links.length) desc.push(links.join(' • '));

    const sourceIcon = config.sources?.radarr?.icon || '';

    return [{
      author: sourceIcon ? { name: 'Radarr', icon_url: sourceIcon } : undefined,
      title: `${icon} ${title}${year ? ` (${year})` : ''}`,
      url: tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : undefined,
      description: desc.filter(Boolean).join('\n\n'),
      color: parseInt((config.sources?.radarr?.color || '#FFA500').replace('#', ''), 16),
      fields,
      thumbnail: poster ? { url: poster } : undefined,
      image: fanart ? { url: fanart } : undefined,
      footer: { text: event },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
