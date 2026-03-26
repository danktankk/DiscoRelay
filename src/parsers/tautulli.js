module.exports = function parse(body, sourceConfig) {
  // Tautulli can send via script or webhook with custom JSON
  // Common fields: action, user, title, player, quality_profile, stream_decision, media_type
  const action = (body.action || body.trigger || 'unknown').toLowerCase();
  const user = body.user || body.friendly_name || 'Someone';
  const title = body.title || body.full_title || 'Unknown';
  const player = body.player || body.platform || '';
  const quality = body.quality_profile || body.stream_video_full_resolution || '';
  const decision = body.transcode_decision || body.stream_decision || '';
  const decisionStr = decision ? (decision === 'direct play' ? 'Direct Play' : decision === 'copy' ? 'Direct Stream' : 'Transcode') : '';

  let icon, desc;
  switch (action) {
    case 'play': case 'on_play': case 'playback.started':
      icon = '▶️';
      desc = `**${user}** is watching **${title}**`;
      if (player) desc += ` on ${player}`;
      if (quality || decisionStr) desc += ` (${[quality, decisionStr].filter(Boolean).join(' ')})`;
      break;
    case 'stop': case 'on_stop': case 'playback.stopped':
      icon = '⏹️';
      desc = `**${user}** stopped **${title}**`;
      break;
    case 'pause': case 'on_pause':
      icon = '⏸️';
      desc = `**${user}** paused **${title}**`;
      break;
    case 'resume': case 'on_resume':
      icon = '▶️';
      desc = `**${user}** resumed **${title}**`;
      break;
    case 'buffer': case 'on_buffer':
      icon = '⏳';
      desc = `**${user}** is buffering **${title}**`;
      break;
    case 'watched': case 'on_watched':
      icon = '👁️';
      desc = `**${user}** watched **${title}**`;
      break;
    case 'created': case 'on_created': case 'recently_added':
      icon = '🆕';
      desc = `Recently added: **${title}**`;
      break;
    default:
      icon = '🎬';
      desc = `${action}: **${title}**`;
      if (user) desc += ` (${user})`;
  }

  return [{
    route: sourceConfig.route || 'media',
    embed: {
      title: `${icon} ${desc}`,
      color: sourceConfig.color || '#CC7B19',
      thumbnail: sourceConfig.icon,
      footer: 'Tautulli',
    },
  }];
};
