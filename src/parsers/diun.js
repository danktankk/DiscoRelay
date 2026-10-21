const { etTime } = require('../utils');

// DIUN webhook notifier (DIUN_NOTIF_WEBHOOK_ENDPOINT=http://<hub>:3080/webhook/diun?token=...)
// Payload: { diun_version, hostname, status, provider, image, hub_link, mime_type, digest, created, platform, metadata }
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

    const fields = [];
    if (host) fields.push({ name: 'Host', value: '`' + host + '`', inline: true });
    fields.push({ name: 'Status', value: isNew ? 'New image tracked' : 'Update available', inline: true });
    if (body.provider) fields.push({ name: 'Provider', value: String(body.provider), inline: true });
    if (container) fields.push({ name: 'Container', value: '`' + String(container).slice(0, 100) + '`', inline: true });
    if (body.platform) fields.push({ name: 'Platform', value: String(body.platform), inline: true });
    if (digest) fields.push({ name: 'Digest', value: '`' + digest + '`', inline: true });
    if (body.created) fields.push({ name: 'Image created', value: String(body.created).slice(0, 19).replace('T', ' '), inline: true });

    const icon = (config.sources && config.sources.diun && config.sources.diun.icon) || '';
    const authorName = host ? `DIUN  ·  ${host}` : 'DIUN';
    const hubLink = typeof body.hub_link === 'string' && /^https?:\/\//.test(body.hub_link) ? body.hub_link : undefined;

    return [{
      author: icon ? { name: authorName, icon_url: icon } : { name: authorName },
      title: `${isNew ? 'New' : 'Update'}: ${image}`.slice(0, 256),
      url: hubLink,
      color: isNew ? 0x3B82F6 : 0xFFAA2C,
      fields,
      footer: { text: `DIUN  ·  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route: 'updates',
    }];
  },
};
