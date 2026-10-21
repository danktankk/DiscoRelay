const { etTime } = require('../utils');

// Uptime Kuma "webhook" notification (JSON): { heartbeat, monitor, msg }
module.exports = {
  name: 'Uptime Kuma',
  parse(body, config) {
    const heartbeat = body.heartbeat || {};
    const monitor = body.monitor || {};
    const status = heartbeat.status; // 0 down, 1 up, 2 pending, 3 maintenance
    const isDown = status === 0;
    const isUp = status === 1;
    const name = monitor.name || monitor.hostname || 'Unknown';
    const url = monitor.url || monitor.hostname || '';
    const msg = heartbeat.msg || '';
    const ping = heartbeat.ping;
    const monitorType = monitor.type || '';
    const method = monitor.method || '';
    const timeout = monitor.timeout;
    const maintenance = monitor.maintenance ? 'Yes' : 'No';
    const codes = Array.isArray(monitor.accepted_statuscodes) ? monitor.accepted_statuscodes.join(', ') : '';
    const cfg = (config.sources && config.sources.uptimekuma) || {};

    const badge = isDown ? '🔴 Down' : isUp ? '✅ Up' : status === 3 ? '🛠 Maintenance' : '⏳ Pending';
    const title = `[${name}] [${badge}] ${msg || (isUp ? 'OK' : '')}`.trim();

    const fields = [];
    if (status !== undefined) fields.push({ name: 'Status', value: String(status), inline: true });
    if (monitorType) fields.push({ name: 'Type', value: monitorType, inline: true });
    if (method) fields.push({ name: 'Method', value: method, inline: true });
    if (timeout !== undefined && timeout !== null && timeout !== '') fields.push({ name: 'Timeout', value: String(timeout), inline: true });
    fields.push({ name: 'Maintenance', value: maintenance, inline: true });
    if (codes) fields.push({ name: 'Codes', value: codes, inline: true });
    if (isUp && ping !== undefined && ping !== null) fields.push({ name: 'Ping', value: `${ping}ms`, inline: true });
    if (url) fields.push({ name: 'Link', value: String(url).slice(0, 1024), inline: false });
    if (isDown && msg) fields.push({ name: 'Error', value: '```\n' + String(msg).slice(0, 1000) + '\n```', inline: false });

    const icon = cfg.icon || '';
    return [{
      author: icon ? { name: `Uptime Kuma: ${name}`, icon_url: icon } : { name: `Uptime Kuma: ${name}` },
      title: title.slice(0, 256),
      color: isDown ? 0xDC2626 : isUp ? 0x22C55E : 0xF59E0B,
      fields,
      footer: { text: `Uptime Kuma  ·  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route: isDown ? 'critical' : 'daily',
    }];
  },
};
