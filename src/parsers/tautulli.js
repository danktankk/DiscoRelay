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
    const poster = body.poster_url || '';
    const year = body.year || '';
    const library = body.library_name || '';
    
    const icons = { play: '▶️', stop: '⏹️', pause: '⏸️', buffer: '⏳', created: '🆕', watched: '👁️' };
    const icon = icons[action] || '📺';
    
    const actionText = {
      play: `${user} is watching`,
      stop: `${user} stopped watching`,
      pause: `${user} paused`,
      buffer: `${user} is buffering`,
      created: 'Recently added',
      watched: `${user} watched`
    };
    
    const fields = [];
    if (player) fields.push({ name: 'Player', value: player, inline: true });
    if (quality) fields.push({ name: 'Quality', value: quality, inline: true });
    if (decision) fields.push({ name: 'Stream', value: decision === 'direct play' ? '🟢 Direct Play' : `🟡 ${decision}`, inline: true });
    if (library) fields.push({ name: 'Library', value: library, inline: true });
    
    return [{
      title: `${icon} ${actionText[action] || action}: ${title}`,
      description: summary.substring(0, 300) || undefined,
      color: parseInt((config.sources?.tautulli?.color || '#CC7B19').replace('#', ''), 16),
      fields,
      thumbnail: { url: config.sources?.tautulli?.icon || '' },
      image: poster ? { url: poster } : undefined,
      footer: { text: `Tautulli • ${library || 'Plex'}` },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
