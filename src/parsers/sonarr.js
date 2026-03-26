module.exports = {
  name: 'Sonarr',
  parse(body, config) {
    const event = body.eventType || 'Unknown';
    const series = body.series || {};
    const episodes = body.episodes || [];
    const release = body.release || {};
    const episodeFile = body.episodeFile || {};
    const title = series.title || 'Unknown Series';
    const overview = series.overview || '';
    const tvdbId = series.tvdbId || '';
    const imdbId = series.imdbId || '';
    
    const images = series.images || [];
    const poster = images.find(i => i.coverType === 'poster')?.remoteUrl || '';
    
    const epList = episodes.map(e => `S${String(e.seasonNumber).padStart(2,'0')}E${String(e.episodeNumber).padStart(2,'0')}`).join(', ');
    const epTitles = episodes.map(e => e.title).filter(Boolean).join(', ');
    const quality = release.quality || episodeFile.quality || '';
    const size = (release.size || episodeFile.size) ? `${((release.size || episodeFile.size) / 1073741824).toFixed(1)} GB` : '';
    
    const icons = { Grab: '📥', Download: '✅', Rename: '📝', SeriesDelete: '🗑️', EpisodeFileDelete: '🗑️', Health: '⚠️', Test: '🧪' };
    const icon = icons[event] || '📺';
    
    const fields = [];
    if (epList) fields.push({ name: 'Episode', value: epList, inline: true });
    if (quality) fields.push({ name: 'Quality', value: String(quality), inline: true });
    if (size) fields.push({ name: 'Size', value: size, inline: true });
    if (epTitles) fields.push({ name: 'Title', value: epTitles, inline: false });
    
    const links = [];
    if (tvdbId) links.push(`[TheTVDB](https://thetvdb.com/?id=${tvdbId}&tab=series)`);
    if (imdbId) links.push(`[IMDb](https://www.imdb.com/title/${imdbId})`);
    
    const desc = [overview.substring(0, 200)];
    if (links.length) desc.push(links.join(' • '));
    
    return [{
      title: `${icon} ${title} ${epList ? '— ' + epList : ''}`,
      url: tvdbId ? `https://thetvdb.com/?id=${tvdbId}&tab=series` : undefined,
      description: desc.filter(Boolean).join('\n\n'),
      color: parseInt((config.sources?.sonarr?.color || '#00BFFF').replace('#', ''), 16),
      fields,
      thumbnail: { url: config.sources?.sonarr?.icon || '' },
      image: poster ? { url: poster } : undefined,
      footer: { text: `Sonarr • ${event}` },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
