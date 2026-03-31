/**
 * Shared utilities for DiscoRelay parsers
 */

/**
 * Extract poster/cover image URL from an images array.
 */
function getImageUrl(images, coverType = 'poster') {
  if (!Array.isArray(images) || !images.length) return '';
  const type = coverType.toLowerCase();
  const img = images.find(i => (i.coverType || '').toLowerCase() === type);
  if (!img) return '';
  if (img.remoteUrl) return img.remoteUrl;
  if (img.url && img.url.startsWith('http')) return img.url;
  return '';
}

/**
 * Format quality from Radarr/Sonarr/Lidarr webhook payloads.
 */
function formatQuality(q) {
  if (!q) return '';
  if (typeof q === 'string') return q;
  if (typeof q === 'object') {
    if (q.quality?.name) return q.quality.name;
    if (q.name) return q.name;
    return '';
  }
  return String(q);
}

/**
 * Format file size from bytes to human-readable.
 */
function formatSize(bytes) {
  if (!bytes) return '';
  const gb = bytes / 1073741824;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1048576).toFixed(0)} MB`;
}

/**
 * Return current Eastern Time as a formatted string for embed footers.
 */
function etTime() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

module.exports = { getImageUrl, formatQuality, formatSize, etTime };
