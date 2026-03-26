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
    
    const fields = [];
    if (url) fields.push({ name: 'URL', value: url, inline: false });
    if (msg) fields.push({ name: 'Message', value: msg, inline: false });
    if (ping && !isDown) fields.push({ name: 'Ping', value: `${ping}ms`, inline: true });
    
    return [{
      title: `${isDown ? '🔴' : '🟢'} ${name} is ${isDown ? 'DOWN' : 'UP'}`,
      description: isDown ? `⚠️ ${msg || 'Service unreachable'}` : `✅ Service recovered`,
      color: parseInt(isDown ? '#DC2626' : '#22C55E', 16),
      fields,
      thumbnail: { url: config.sources?.uptimekuma?.icon || '' },
      footer: { text: 'Uptime Kuma' },
      timestamp: new Date().toISOString(),
      route: isDown ? 'critical' : 'daily'
    }];
  }
};
