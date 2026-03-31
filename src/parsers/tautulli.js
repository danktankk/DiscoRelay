const { etTime } = require('../utils');

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
    const progress = body.progress_percent || '';

    const clean = (val) => (val && !val.startsWith('{') ? val : '');

    const poster = clean(body.poster_url) || clean(body.thumb_url) || clean(body.poster) || '';
    const art = clean(body.art_url) || clean(body.art) || '';
    const plexUrl = clean(body.plex_url) || '';
    const imdbId = clean(body.imdb_id) || '';
    const tmdbId = clean(body.themoviedb_id) || '';
    const tvdbId = clean(body.thetvdb_id) || '';

    const validUrl = (url) => url && url.startsWith('http') && !url.includes('127.0.0.1') && !url.includes('localhost');

    const sourceIcon = config.sources?.tautulli?.icon || '';

    // Server events
    const serverEvents = ['intdown', 'intup', 'extdown', 'extup', 'pmsupdate'];
    if (serverEvents.includes(action)) {
      const serverLabels = {
        intdown: 'Plex Server Down', intup: 'Plex Server Restored',
        extdown: 'Remote Access Lost', extup: 'Remote Access Restored',
        pmsupdate: 'Plex Update Available'
      };
      const isDown = action.includes('down');
      return [{
        author: sourceIcon ? { name: 'Tautulli', icon_url: sourceIcon } : { name: 'Tautulli' },
        title: serverLabels[action] || action,
        description: summary || body.message || undefined,
        color: isDown ? 0xDC2626 : action === 'pmsupdate' ? 0x3498DB : 0x2ECC71,
        footer: { text: `Plex  \u00B7  ${etTime()}` },
        timestamp: new Date().toISOString(),
        route: isDown ? 'critical' : 'media'
      }];
    }

    // Media events — Notifiarr style with fields
    const actionLabels = {
      play: 'Now Playing', stop: 'Stopped', pause: 'Paused',
      resume: 'Resumed', buffer: 'Buffering',
      created: 'Recently Added', watched: 'Watched',
      newdevice: 'New Device', change: 'Stream Changed', error: 'Playback Error'
    };
    const label = actionLabels[action] || action;

    const displayTitle = title || 'Unknown';
    const titleSuffix = year && year !== '{year}' ? ` (${year})` : '';

    const fields = [];

    // User / Player / Quality triplet
    if (user) fields.push({ name: 'User', value: user, inline: true });
    if (player) fields.push({ name: 'Player', value: player, inline: true });
    if (quality) fields.push({ name: 'Quality', value: quality, inline: true });

    // Stream info
    if (decision && decision !== '{stream_decision}' && decision !== '{transcode_decision}') {
      fields.push({ name: 'Stream', value: decision === 'direct play' ? 'Direct Play' : decision, inline: true });
    }
    if (library && library !== '{library_name}') {
      fields.push({ name: 'Library', value: library, inline: true });
    }
    if (mediaType && mediaType !== '{media_type}') {
      fields.push({ name: 'Type', value: mediaType, inline: true });
    }

    // Progress / duration
    if (progress && progress !== '{progress_percent}') {
      fields.push({ name: 'Progress', value: `${progress}%`, inline: true });
    }

    // Summary
    if (summary && summary !== '{summary}') {
      fields.push({ name: 'Overview', value: summary.substring(0, 300), inline: false });
    }

    // Links
    const links = [];
    if (validUrl(plexUrl)) links.push(`[Plex](${plexUrl})`);
    if (imdbId && imdbId !== '{imdb_id}') links.push(`[IMDb](https://www.imdb.com/title/${imdbId})`);
    if (tmdbId && tmdbId !== '{themoviedb_id}') links.push(`[TMDb](https://www.themoviedb.org/movie/${tmdbId})`);
    if (tvdbId && tvdbId !== '{thetvdb_id}') links.push(`[TheTVDB](https://thetvdb.com/?id=${tvdbId}&tab=series)`);
    if (links.length) fields.push({ name: 'Links', value: links.join(' - '), inline: false });

    const finalPoster = validUrl(poster) ? poster : '';
    const finalArt = validUrl(art) ? art : '';

    return [{
      author: sourceIcon ? { name: `${label} — Tautulli`, icon_url: sourceIcon } : { name: `${label} — Tautulli` },
      title: `${displayTitle}${titleSuffix}`,
      color: parseInt((config.sources?.tautulli?.color || '#CC7B19').replace('#', ''), 16),
      fields,
      thumbnail: finalPoster ? { url: finalPoster } : undefined,
      image: finalArt ? { url: finalArt } : (finalPoster ? { url: finalPoster } : undefined),
      footer: { text: `${(library && library !== '{library_name}') ? library : 'Plex'}  \u00B7  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
