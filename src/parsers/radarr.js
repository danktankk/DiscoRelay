module.exports = function parse(body, sourceConfig) {
  const event = body.eventType || 'Unknown';
  const movie = body.movie || body.remoteMovie || {};
  const title = movie.title || body.title || 'Unknown Movie';
  const year = movie.year ? ` (${movie.year})` : '';
  const quality = body.release?.quality || body.movieFile?.quality?.quality?.name || '';
  const qualityStr = quality ? (typeof quality === 'string' ? quality : quality.name || '') : '';

  let icon, desc;
  switch (event) {
    case 'Grab':
      icon = '📥'; desc = `Grabbed: **${title}**${year}`;
      if (qualityStr) desc += ` — ${qualityStr}`;
      break;
    case 'Download':
      icon = body.isUpgrade ? '⬆️' : '✅';
      desc = `${body.isUpgrade ? 'Upgraded' : 'Imported'}: **${title}**${year}`;
      if (qualityStr) desc += ` — ${qualityStr}`;
      break;
    case 'Rename':
      icon = '📝'; desc = `Renamed: **${title}**${year}`;
      break;
    case 'MovieAdded':
      icon = '➕'; desc = `Added: **${title}**${year}`;
      break;
    case 'MovieDelete':
      icon = '🗑️'; desc = `Deleted: **${title}**${year}`;
      break;
    case 'Health':
      return [{
        route: 'warning',
        embed: {
          title: '⚠️ Radarr Health',
          description: body.message || 'Health check issue',
          color: '#F59E0B',
          thumbnail: sourceConfig.icon,
          footer: 'Radarr',
        },
      }];
    case 'Test':
      icon = '🧪'; desc = 'Test notification';
      break;
    default:
      icon = '🎬'; desc = `${event}: **${title}**${year}`;
  }

  return [{
    route: sourceConfig.route || 'media',
    embed: {
      title: `${icon} ${desc}`,
      color: sourceConfig.color || '#FFA500',
      thumbnail: sourceConfig.icon,
      footer: 'Radarr',
    },
  }];
};
