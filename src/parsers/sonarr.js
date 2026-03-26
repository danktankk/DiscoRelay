module.exports = function parse(body, sourceConfig) {
  const event = body.eventType || 'Unknown';
  const series = body.series || {};
  const title = series.title || 'Unknown Series';
  const episodes = body.episodes || [];
  const quality = body.release?.quality || body.episodeFile?.quality?.quality?.name || '';
  const qualityStr = quality ? (typeof quality === 'string' ? quality : quality.name || '') : '';

  function episodeTag() {
    if (!episodes.length) return '';
    if (episodes.length === 1) {
      const e = episodes[0];
      return ` S${String(e.seasonNumber).padStart(2,'0')}E${String(e.episodeNumber).padStart(2,'0')}`;
    }
    return ` (${episodes.length} episodes)`;
  }

  let icon, desc;
  switch (event) {
    case 'Grab':
      icon = '📥'; desc = `Grabbed: **${title}**${episodeTag()}`;
      if (qualityStr) desc += ` — ${qualityStr}`;
      break;
    case 'Download':
      icon = body.isUpgrade ? '⬆️' : '✅';
      desc = `${body.isUpgrade ? 'Upgraded' : 'Imported'}: **${title}**${episodeTag()}`;
      if (qualityStr) desc += ` — ${qualityStr}`;
      break;
    case 'Rename':
      icon = '📝'; desc = `Renamed: **${title}**`;
      break;
    case 'SeriesAdd':
      icon = '➕'; desc = `Added: **${title}**`;
      break;
    case 'SeriesDelete':
      icon = '🗑️'; desc = `Deleted: **${title}**`;
      break;
    case 'Health':
      return [{
        route: 'warning',
        embed: {
          title: '⚠️ Sonarr Health',
          description: body.message || 'Health check issue',
          color: '#F59E0B',
          thumbnail: sourceConfig.icon,
          footer: 'Sonarr',
        },
      }];
    case 'Test':
      icon = '🧪'; desc = 'Test notification';
      break;
    default:
      icon = '📺'; desc = `${event}: **${title}**${episodeTag()}`;
  }

  return [{
    route: sourceConfig.route || 'media',
    embed: {
      title: `${icon} ${desc}`,
      color: sourceConfig.color || '#00BFFF',
      thumbnail: sourceConfig.icon,
      footer: 'Sonarr',
    },
  }];
};
