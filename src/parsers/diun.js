const { etTime } = require('../utils');

// DIUN webhook notifier: DIUN_NOTIF_WEBHOOK_ENDPOINT=http://<hub>:3080/webhook/diun?token=...
// Payload: { diun_version, hostname, status, provider, image, hub_link, mime_type, digest, created, platform, metadata }
// Set sources.diun.forward to keep feeding diun-dash from the same webhook.
module.exports = {
  name: 'DIUN',
  parse(body, config) {
    if (!body || typeof body !== 'object') throw new Error('body must be a DIUN webhook JSON object');
    const image = String(body.image || 'unknown image');
    const status = String(body.status || 'update').toLowerCase();
    const host = body.hostname ? String(body.hostname) : '';
    const digest = String(body.digest || '').replace(/^sha256:/, '').slice(0, 12);
    const isNew = status === 'new';
    const meta = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    const container = meta.ctn_names || meta.ctn_name || meta.ctn_id || '';
    const cfg = (config.sources && config.sources.diun) || {};
    const [repo, tag] = image.includes(':') ? [image.slice(0, image.lastIndexOf(':')), image.slice(image.lastIndexOf(':') + 1)] : [image, ''];

    const fields = [];
    if (host) fields.push({ name: 'Host', value: '`' + host + '`', inline: true });
    if (container) fields.push({ name: 'Container', value: '`' + String(container).slice(0, 100) + '`', inline: true });
    if (tag) fields.push({ name: 'Tag', value: '`' + tag + '`', inline: true });
    if (body.provider) fields.push({ name: 'Provider', value: String(body.provider), inline: true });
    if (body.platform) fields.push({ name: 'Platform', value: String(body.platform), inline: true });
    if (digest) fields.push({ name: 'Digest', value: '`' + digest + '`', inline: true });
    if (body.created) fields.push({ name: 'Image created', value: String(body.created).slice(0, 19).replace('T', ' '), inline: true });

    const icon = cfg.icon || '';
    const authorName = isNew ? 'Image Tracked' : 'Update Available';
    const hubLink = typeof body.hub_link === 'string' && /^https?:\/\//.test(body.hub_link) ? body.hub_link : undefined;
    const description = isNew
      ? `Now tracking **${image}**${host ? ` on **${host}**` : ''}.`
      : `A new image is available for **${image}**${host ? ` on **${host}**` : ''}.`;

    return [{
      author: icon ? { name: `${authorName} — DIUN`, icon_url: icon } : { name: `${authorName} — DIUN` },
      title: (hubLink ? repo : image).slice(0, 256),
      url: hubLink,
      description,
      color: isNew ? 0x3B82F6 : 0xFFAA2C,
      fields,
      footer: { text: `DIUN${body.diun_version ? ' ' + body.diun_version : ''}  ·  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route: cfg.route && cfg.route !== 'auto' ? cfg.route : 'updates',
    }];
  },
};
