module.exports = function parse(body, sourceConfig) {
  const event = body.eventType || 'Unknown';
  const artist = body.artist?.name || 'Unknown Artist';
  const album = body.albums?.[0]?.title || body.album?.title || '';
  const quality = body.release?.quality || '';
  const qualityStr = quality ? (typeof quality === 'string' ? quality : quality.name || '') : '';

  const mediaStr = album ? `**${artist}** — ${album}` : `**${artist}**`;

  let icon, desc;
  switch (event) {
    case 'Grab':
      icon = '📥'; desc = `Grabbed: ${mediaStr}`;
      if (qualityStr) desc += ` (${qualityStr})`;
      break;
    case 'Download':
      icon = body.isUpgrade ? '⬆️' : '✅';
      desc = `${body.isUpgrade ? 'Upgraded' : 'Imported'}: ${mediaStr}`;
      break;
    case 'Rename':
      icon = '📝'; desc = `Renamed: ${mediaStr}`;
      break;
    case 'ArtistAdded':
      icon = '➕'; desc = `Added: ${mediaStr}`;
      break;
    case 'Health':
      return [{
        route: 'warning',
        embed: {
          title: '⚠️ Lidarr Health',
          description: body.message || 'Health check issue',
          color: '#F59E0B',
          thumbnail: sourceConfig.icon,
          footer: 'Lidarr',
        },
      }];
    case 'Test':
      icon = '🧪'; desc = 'Test notification';
      break;
    default:
      icon = '🎵'; desc = `${event}: ${mediaStr}`;
  }

  return [{
    route: sourceConfig.route || 'media',
    embed: {
      title: `${icon} ${desc}`,
      color: sourceConfig.color || '#00FF00',
      thumbnail: sourceConfig.icon,
      footer: 'Lidarr',
    },
  }];
};
