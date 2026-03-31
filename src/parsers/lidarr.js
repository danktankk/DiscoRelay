const { getImageUrl, formatQuality, formatSize, etTime } = require('../utils');

module.exports = {
  name: 'Lidarr',
  parse(body, config) {
    const event = body.eventType || 'Unknown';
    const artist = body.artist || {};
    const album = body.album || {};
    const release = body.release || {};
    const tracks = body.tracks || [];
    const artistName = artist.artistName || 'Unknown Artist';
    const albumTitle = album.title || '';
    const albumYear = album.releaseDate ? album.releaseDate.substring(0, 4) : '';
    const albumType = album.albumType || '';
    const overview = album.overview || artist.overview || '';
    const genres = (artist.genres || album.genres || []).join(', ');
    const mbId = artist.mbId || '';
    const downloadClient = body.downloadClient || '';
    const indexer = release.indexer || '';
    const releaseTitle = release.releaseTitle || '';

    const artistImages = artist.images || [];
    const albumImages = album.images || [];
    const albumCover = getImageUrl(albumImages, 'cover') || getImageUrl(albumImages, 'poster');
    const artistPoster = getImageUrl(artistImages, 'poster') || getImageUrl(artistImages, 'banner');
    const poster = albumCover || artistPoster;

    const quality = formatQuality(release.quality);
    const size = formatSize(release.size);

    // Musicbrainz rating if available
    const rating = album.ratings?.value || artist.ratings?.value || '';

    const eventLabels = {
      Grab: 'Grabbed', Download: 'Imported', Rename: 'Renamed',
      AlbumDelete: 'Deleted', ArtistDelete: 'Artist Deleted',
      Retag: 'Retagged', Health: 'Health Check',
      ApplicationUpdate: 'Updated', Test: 'Test'
    };
    const label = eventLabels[event] || event;

    const eventColors = {
      Grab: 0x3498DB, Download: 0x2ECC71, Rename: 0x9B59B6,
      AlbumDelete: 0xE74C3C, ArtistDelete: 0xE74C3C,
      Retag: 0x9B59B6, Health: 0xF39C12,
      ApplicationUpdate: 0x3498DB, Test: 0x95A5A6
    };
    const color = eventColors[event] || 0x00FF00;

    const sourceIcon = config.sources?.lidarr?.icon || '';

    const fields = [];

    fields.push({ name: 'Artist', value: artistName, inline: true });

    // Inline triplet: type / rating / quality
    if (albumType) fields.push({ name: 'Type', value: albumType, inline: true });
    if (rating) fields.push({ name: 'Rating', value: String(rating), inline: true });

    if (overview) {
      fields.push({ name: 'Overview', value: overview.substring(0, 300), inline: false });
    }

    if (genres) {
      fields.push({ name: 'Genres', value: genres, inline: false });
    }

    // Links
    const links = [];
    if (mbId) links.push(`[MusicBrainz](https://musicbrainz.org/artist/${mbId})`);
    if (links.length) fields.push({ name: 'Links', value: links.join(' - '), inline: true });

    // Inline triplet: quality / size / indexer
    if (quality || size || indexer) {
      if (quality) fields.push({ name: 'Quality', value: quality, inline: true });
      if (size) fields.push({ name: 'Size', value: size, inline: true });
      if (indexer) fields.push({ name: 'Indexer', value: indexer, inline: true });
    }

    if (tracks.length) {
      fields.push({ name: 'Tracks', value: String(tracks.length), inline: true });
    }

    if (downloadClient) {
      fields.push({ name: 'Download Client', value: downloadClient, inline: true });
    }

    // Release name
    if (releaseTitle && (event === 'Grab' || event === 'Download')) {
      fields.push({ name: 'Release', value: '`' + releaseTitle.substring(0, 200) + '`', inline: false });
    }

    return [{
      author: sourceIcon ? { name: `${label} — Lidarr`, icon_url: sourceIcon } : { name: `${label} — Lidarr` },
      title: `${albumTitle || artistName}${albumYear ? ` (${albumYear})` : ''}`,
      color,
      fields,
      thumbnail: poster ? { url: poster } : undefined,
      footer: { text: etTime() },
      timestamp: new Date().toISOString(),
      route: 'media'
    }];
  }
};
