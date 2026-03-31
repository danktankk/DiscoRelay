const { etTime } = require('../utils');

module.exports = {
  name: 'Uptime Kuma',
  parse(body, config) {
    const heartbeat = body.heartbeat || {};
    const monitor = body.monitor || {};
    const isDown = heartbeat.status === 0;
    const name = monitor.name || monitor.hostname || 'Unknown';
    const url = monitor.url || '';
    const msg = heartbeat.msg || '';
    const ping = heartbeat.ping || '';
    const monitorType = monitor.type || '';
    const method = monitor.method || '';
    const timeout = monitor.timeout || '';
    const maintenance = monitor.maintenance ? 'Yes' : 'No';

    const sourceIcon = config.sources?.uptimekuma?.icon || '';
    const statusText = isDown ? 'Down' : 'Up';
    const statusLabel = isDown ? `[${name}] Down` : `[${name}] ${msg || 'OK'}`;

    const fields = [];

    // Inline triplets — Notifiarr style
    if (monitorType || method || timeout) {
      if (monitorType) fields.push({ name: 'Type', value: monitorType, inline: true });
      if (method) fields.push({ name: 'Method', value: method, inline: true });
      if (timeout) fields.push({ name: 'Timeout', value: String(timeout), inline: true });
    }

    if (!isDown && ping) {
      fields.push({ name: 'Ping', value: `${ping}ms`, inline: true });
    }

    fields.push({ name: 'Maintenance', value: maintenance, inline: true });

    if (url) fields.push({ name: 'Link', value: url, inline: false });

    if (isDown && msg) {
      fields.push({ name: 'Error', value: '```\n' + msg + '\n```', inline: false });
    }

    return [{
      author: sourceIcon ? { name: `Uptime Kuma: ${name}`, icon_url: sourceIcon } : { name: `Uptime Kuma: ${name}` },
      title: statusLabel,
      color: isDown ? 0xDC2626 : 0x22C55E,
      fields,
      footer: { text: etTime() },
      timestamp: new Date().toISOString(),
      route: isDown ? 'critical' : 'daily'
    }];
  }
};
