const { getImageUrl, formatQuality, formatSize, etTime } = require('../utils');

module.exports = {
  name: 'Radarr',
  parse(body, config) {
    const event = body.eventType || 'Unknown';
    const movie = body.movie || body.remoteMovie || {};
    const release = body.release || {};
    const movieFile = body.movieFile || {};
    const title = movie.title || 'Unknown Movie';
    const year = movie.year || '';
    const quality = formatQuality(release.quality || movieFile.quality);
    const size = formatSize(release.size || movieFile.size);
    const overview = movie.overview || '';
    const tmdbId = movie.tmdbId || body.remoteMovie?.tmdbId || '';
    const imdbId = movie.imdbId || body.remoteMovie?.imdbId || '';
    const genres = (movie.genres || []).join(', ');
    const runtime = movie.runtime ? `${movie.runtime}m` : '';
    const rating = movie.ratings?.tmdb?.value || movie.ratings?.imdb?.value || '';
    const releaseTitle = release.releaseTitle || movieFile.relativePath || '';
    const indexer = release.indexer || '';
    const downloadClient = body.downloadClient || '';
    const customFormats = body.customFormatInfo?.customFormats || [];
    const customFormatScore = body.customFormatInfo?.customFormatScore;

    const images = movie.images || [];
    let poster = getImageUrl(images, 'poster');
    const fanart = getImageUrl(images, 'fanart');

    const eventLabels = {
      Grab: 'Grabbed', Download: 'Imported', Rename: 'Renamed',
      MovieDelete: 'Deleted', MovieFileDelete: 'File Deleted',
      MovieAdded: 'Added', Health: 'Health Check',
      ApplicationUpdate: 'Updated', Test: 'Test'
    };
    const label = eventLabels[event] || event;

    // Notifiarr-style color per event
    const eventColors = {
      Grab: 0x3498DB, Download: 0x2ECC71, Rename: 0x9B59B6,
      MovieDelete: 0xE74C3C, MovieFileDelete: 0xE74C3C,
      MovieAdded: 0x1ABC9C, Health: 0xF39C12,
      ApplicationUpdate: 0x3498DB, Test: 0x95A5A6
    };
    const color = eventColors[event] || 0xFFA500;

    const sourceIcon = config.sources?.radarr?.icon || '';

    // Build Notifiarr-style fields — inline triplets
    const fields = [];

    if (rating || quality || runtime) {
      if (rating) fields.push({ name: 'Rating', value: String(rating), inline: true });
      if (quality) fields.push({ name: 'Quality', value: quality, inline: true });
      if (runtime) fields.push({ name: 'Runtime', value: runtime, inline: true });
    }

    if (size || indexer || downloadClient) {
      if (size) fields.push({ name: 'Size', value: size, inline: true });
      if (indexer) fields.push({ name: 'Indexer', value: indexer, inline: true });
      if (downloadClient) fields.push({ name: 'Download Client', value: downloadClient, inline: true });
    }

    if (overview) {
      fields.push({ name: 'Overview', value: overview.substring(0, 300), inline: false });
    }

    if (genres) {
      fields.push({ name: 'Genres', value: genres, inline: false });
    }

    // Links — Notifiarr style
    const links = [];
    if (tmdbId) links.push(`[TMDb](https://www.themoviedb.org/movie/${tmdbId})`);
    if (imdbId) links.push(`[IMDb](https://www.imdb.com/title/${imdbId})`);
    if (links.length) fields.push({ name: 'Links', value: links.join(' - '), inline: true });

    // Custom formats in code block
    if (customFormats.length) {
      const cfLines = [];
      if (customFormatScore != null) cfLines.push(`Score : ${customFormatScore}`);
      cfLines.push(`Format: ${customFormats.map(f => f.name).join(', ')}`);
      fields.push({ name: 'Custom Formats', value: '```\n' + cfLines.join('\n') + '\n```', inline: false });
    }

    // Release name in code block
    if (releaseTitle && (event === 'Grab' || event === 'Download')) {
      fields.push({ name: 'Release', value: '`' + releaseTitle.substring(0, 200) + '`', inline: false });
    }

    return [{
      author: sourceIcon ? { name: `${label} — Radarr`, icon_url: sourceIcon } : { name: `${label} — Radarr` },
      title: `${title}${year ? ` (${year})` : ''}`,
      url: tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : undefined,
      color,
      fields,
      thumbnail: poster ? { url: poster } : undefined,
      image: fanart ? { url: fanart } : undefined,
      footer: { text: etTime() },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
