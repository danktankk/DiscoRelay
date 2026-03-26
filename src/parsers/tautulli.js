module.exports = {
  name: 'Tautulli',
  parse(body, config) {
    const action = body.action || body.trigger || 'unknown';
    const title = body.full_title || body.title || '';
    const user = body.user || body.username || '';
    const player = body.player || body.platform_name || '';
    const quality = body.quality_profile || body.stream_video_full_resolution || '';
    const decision = body.stream_decision || body.transcode_decision || '';
    const summary = body.summary || '';
    const year = body.year || '';
    const library = body.library_name || '';
    const mediaType = body.media_type || '';
    const duration = body.duration || '';

    // Filter out unresolved Tautulli placeholders like "{poster_url}"
    const clean = (val) => (val && !val.startsWith('{') ? val : '');

    const poster = clean(body.poster_url) || clean(body.thumb_url) || clean(body.poster) || '';
    const art = clean(body.art_url) || clean(body.art) || '';
    const plexUrl = clean(body.plex_url) || '';
    const imdbUrl = clean(body.imdb_url) || '';
    const imdbId = clean(body.imdb_id) || '';
    const tmdbId = clean(body.themoviedb_id) || '';
    const tvdbId = clean(body.thetvdb_id) || '';

    // Validate URLs — Discord rejects non-http URLs and local Plex URLs won't render
    const validUrl = (url) => url && url.startsWith('http') && !url.includes('127.0.0.1') && !url.includes('localhost');

    const icons = {
      play: '▶️', stop: '⏹️', pause: '⏸️', resume: '▶️', buffer: '⏳',
      created: '🆕', watched: '👁️', newdevice: '📱',
      intdown: '🔴', intup: '🟢', extdown: '🔴', extup: '🟢',
      pmsupdate: '🔄', change: '🔀', error: '❌'
    };
    const icon = icons[action] || '📺';

    const actionText = {
      play: user ? `${user} is watching` : 'Now playing',
      stop: user ? `${user} stopped` : 'Stopped',
      pause: user ? `${user} paused` : 'Paused',
      resume: user ? `${user} resumed` : 'Resumed',
      buffer: user ? `${user} is buffering` : 'Buffering',
      created: 'Recently Added',
      watched: user ? `${user} watched` : 'Watched',
      newdevice: user ? `${user} — new device` : 'New device',
      intdown: '⚠️ Plex Server Down',
      intup: '✅ Plex Server Back Up',
      extdown: '⚠️ Remote Access Lost',
      extup: '✅ Remote Access Restored',
      pmsupdate: '🔄 Plex Update Available',
      change: user ? `${user} changed stream` : 'Stream changed',
      error: user ? `${user} hit an error` : 'Playback error'
    };

    // Server events (no media)
    const serverEvents = ['intdown', 'intup', 'extdown', 'extup', 'pmsupdate'];
    if (serverEvents.includes(action)) {
      return [{
        author: config.sources?.tautulli?.icon ? { name: 'Tautulli', icon_url: config.sources.tautulli.icon } : undefined,
        title: actionText[action] || action,
        description: summary || body.message || undefined,
        color: action.includes('down') ? 0xDC2626 : action.includes('up') ? 0x22C55E : 0xCC7B19,
        footer: { text: 'Plex' },
        timestamp: new Date().toISOString(),
        route: action.includes('down') ? 'critical' : 'media'
      }];
    }

    // Non-media events (newdevice, etc)
    const displayTitle = title || 'Unknown';
    const titleSuffix = year && year !== '{year}' ? ` (${year})` : '';
    const embedTitle = `${icon} ${actionText[action] || action}: ${displayTitle}${titleSuffix}`;

    // Build description
    const lines = [];
    if (summary && summary !== '{summary}') lines.push(summary.substring(0, 300));

    // Metadata line
    const meta = [];
    if (player) meta.push(`🖥️ ${player}`);
    if (quality) meta.push(`📺 ${quality}`);
    if (decision && decision !== '{stream_decision}' && decision !== '{transcode_decision}') {
      meta.push(decision === 'direct play' ? '🟢 Direct Play' : `🟡 ${decision}`);
    }
    if (library && library !== '{library_name}') meta.push(`📚 ${library}`);
    if (meta.length) {
      lines.push('');
      lines.push(meta.join('  ·  '));
    }

    // Links
    const links = [];
    if (validUrl(plexUrl)) links.push(`[Plex](${plexUrl})`);
    if (imdbId && imdbId !== '{imdb_id}') links.push(`[IMDb](https://www.imdb.com/title/${imdbId})`);
    else if (validUrl(imdbUrl)) links.push(`[IMDb](${imdbUrl})`);
    if (tmdbId && tmdbId !== '{themoviedb_id}') links.push(`[TMDB](https://www.themoviedb.org/movie/${tmdbId})`);
    if (tvdbId && tvdbId !== '{thetvdb_id}') links.push(`[TVDB](https://thetvdb.com/?id=${tvdbId}&tab=series)`);
    if (links.length) {
      lines.push('');
      lines.push(links.join(' • '));
    }

    const sourceIcon = config.sources?.tautulli?.icon || '';

    return [{
      author: sourceIcon ? { name: 'Tautulli', icon_url: sourceIcon } : undefined,
      title: embedTitle,
      description: lines.filter(Boolean).join('\n') || undefined,
      color: parseInt((config.sources?.tautulli?.color || '#CC7B19').replace('#', ''), 16),
      thumbnail: validUrl(poster) ? { url: poster } : undefined,
      image: validUrl(art) ? { url: art } : undefined,
      footer: { text: (library && library !== '{library_name}') ? library : 'Plex' },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
