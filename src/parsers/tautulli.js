module.exports = {
  name: 'Tautulli',
  parse(body, config) {
    const action = body.action || body.trigger || 'unknown';
    const title = body.full_title || body.title || 'Unknown';
    const user = body.user || body.username || 'Someone';
    const player = body.player || body.platform_name || '';
    const quality = body.quality_profile || body.stream_video_full_resolution || '';
    const decision = body.stream_decision || body.transcode_decision || '';
    const summary = body.summary || '';
    const year = body.year || '';
    const library = body.library_name || '';

    // Tautulli poster_url — may be local (e.g. http://plex:32400/...)
    // thumb_url or poster_url from Tautulli notification agent
    const poster = body.poster_url || body.thumb_url || body.poster || '';
    const art = body.art_url || body.art || '';

    // Plex links
    const plexUrl = body.plex_url || '';
    const imdbUrl = body.imdb_url || '';

    const icons = { play: '▶️', stop: '⏹️', pause: '⏸️', buffer: '⏳', created: '🆕', watched: '👁️' };
    const icon = icons[action] || '📺';

    const actionText = {
      play: `${user} is watching`,
      stop: `${user} stopped watching`,
      pause: `${user} paused`,
      buffer: `${user} is buffering`,
      created: 'Recently Added',
      watched: `${user} watched`
    };

    const fields = [];
    if (player) fields.push({ name: 'Player', value: player, inline: true });
    if (quality) fields.push({ name: 'Quality', value: quality, inline: true });
    if (decision) fields.push({ name: 'Stream', value: decision === 'direct play' ? '🟢 Direct Play' : `🟡 ${decision}`, inline: true });
    if (library) fields.push({ name: 'Library', value: library, inline: true });

    const links = [];
    if (plexUrl) links.push(`[Plex](${plexUrl})`);
    if (imdbUrl) links.push(`[IMDb](${imdbUrl})`);

    const desc = [summary.substring(0, 300)];
    if (links.length) desc.push(links.join(' • '));

    const sourceIcon = config.sources?.tautulli?.icon || '';

    return [{
      author: sourceIcon ? { name: 'Tautulli', icon_url: sourceIcon } : undefined,
      title: `${icon} ${actionText[action] || action}: ${title}${year ? ` (${year})` : ''}`,
      description: desc.filter(Boolean).join('\n\n') || undefined,
      color: parseInt((config.sources?.tautulli?.color || '#CC7B19').replace('#', ''), 16),
      fields,
      thumbnail: poster ? { url: poster } : undefined,
      image: art ? { url: art } : undefined,
      footer: { text: library || 'Plex' },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
