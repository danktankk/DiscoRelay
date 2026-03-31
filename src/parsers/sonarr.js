const { getImageUrl, formatQuality, formatSize, etTime } = require('../utils');

module.exports = {
  name: 'Sonarr',
  parse(body, config) {
    const event = body.eventType || 'Unknown';
    const series = body.series || {};
    const episodes = body.episodes || [];
    const release = body.release || {};
    const episodeFile = body.episodeFile || {};
    const title = series.title || 'Unknown Series';
    const tvdbId = series.tvdbId || '';
    const imdbId = series.imdbId || '';
    const network = series.network || '';
    const genres = (series.genres || []).join(', ');
    const downloadClient = body.downloadClient || '';
    const indexer = release.indexer || '';
    const releaseTitle = release.releaseTitle || episodeFile.relativePath || '';
    const customFormats = body.customFormatInfo?.customFormats || [];
    const customFormatScore = body.customFormatInfo?.customFormatScore;

    const images = series.images || [];
    const poster = getImageUrl(images, 'poster');
    const fanart = getImageUrl(images, 'fanart') || getImageUrl(images, 'banner');

    // Episode info
    const epList = episodes.map(e =>
      `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`
    ).join(', ');
    const epTitles = episodes.map(e => e.title).filter(Boolean);
    const epOverview = episodes[0]?.overview || '';
    const airDate = episodes[0]?.airDate || '';
    const quality = formatQuality(release.quality || episodeFile.quality);
    const size = formatSize(release.size || episodeFile.size);

    const eventLabels = {
      Grab: 'Grabbed', Download: 'Imported', Rename: 'Renamed',
      SeriesDelete: 'Deleted', EpisodeFileDelete: 'File Deleted',
      SeriesAdd: 'Added', Health: 'Health Check',
      ApplicationUpdate: 'Updated', Test: 'Test'
    };
    const label = eventLabels[event] || event;

    const eventColors = {
      Grab: 0x3498DB, Download: 0x2ECC71, Rename: 0x9B59B6,
      SeriesDelete: 0xE74C3C, EpisodeFileDelete: 0xE74C3C,
      SeriesAdd: 0x1ABC9C, Health: 0xF39C12,
      ApplicationUpdate: 0x3498DB, Test: 0x95A5A6
    };
    const color = eventColors[event] || 0x00BFFF;

    const sourceIcon = config.sources?.sonarr?.icon || '';

    const fields = [];

    // Episode names
    if (epTitles.length) {
      fields.push({ name: 'Episodes', value: epTitles.join(', '), inline: false });
    }

    // Inline triplet: airs / quality / air date
    if (quality || airDate || size) {
      if (airDate) fields.push({ name: 'Air Date', value: airDate, inline: true });
      if (quality) fields.push({ name: 'Quality', value: quality, inline: true });
      if (size) fields.push({ name: 'Size', value: size, inline: true });
    }

    // Episode overview
    if (epOverview) {
      fields.push({ name: `${epList || 'Episode'} Overview`, value: epOverview.substring(0, 300), inline: false });
    }

    // Indexer / Download client
    if (indexer || downloadClient || network) {
      if (network) fields.push({ name: 'Network', value: network, inline: true });
      if (indexer) fields.push({ name: 'Indexer', value: indexer, inline: true });
      if (downloadClient) fields.push({ name: 'Download Client', value: downloadClient, inline: true });
    }

    // Links
    const links = [];
    if (tvdbId) links.push(`[TheTVDB](https://thetvdb.com/?id=${tvdbId}&tab=series)`);
    if (imdbId) links.push(`[IMDb](https://www.imdb.com/title/${imdbId})`);
    if (links.length) fields.push({ name: 'Links', value: links.join(' - '), inline: true });

    // Custom formats
    if (customFormats.length) {
      const cfLines = [];
      if (customFormatScore != null) cfLines.push(`Score : ${customFormatScore}`);
      cfLines.push(`Format: ${customFormats.map(f => f.name).join(', ')}`);
      fields.push({ name: 'Custom Formats', value: '```\n' + cfLines.join('\n') + '\n```', inline: false });
    }

    // Release
    if (releaseTitle && (event === 'Grab' || event === 'Download')) {
      fields.push({ name: 'Release', value: '`' + releaseTitle.substring(0, 200) + '`', inline: false });
    }

    return [{
      author: sourceIcon ? { name: `${label} — Sonarr`, icon_url: sourceIcon } : { name: `${label} — Sonarr` },
      title: `${title}${epList ? ` (${epList})` : ''}`,
      url: tvdbId ? `https://thetvdb.com/?id=${tvdbId}&tab=series` : undefined,
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
