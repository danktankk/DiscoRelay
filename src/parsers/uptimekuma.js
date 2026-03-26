module.exports = function parse(body, sourceConfig) {
  // Uptime Kuma sends: monitor, heartbeat, msg
  const monitor = body.monitor || {};
  const heartbeat = body.heartbeat || {};
  const name = monitor.name || body.monitorName || body.name || 'Unknown Monitor';
  const status = heartbeat.status ?? body.status;
  const msg = heartbeat.msg || body.msg || body.message || '';
  const url = monitor.url || '';

  // status: 0 = down, 1 = up, 2 = pending
  const isDown = status === 0 || status === 'down' || status === false;
  const isUp = status === 1 || status === 'up' || status === true;

  let icon, desc, route, color;
  if (isDown) {
    icon = '🔴'; desc = `**${name}** is DOWN`;
    route = 'critical';
    color = '#DC2626';
  } else if (isUp) {
    icon = '✅'; desc = `**${name}** is back UP`;
    route = 'daily';
    color = sourceConfig.color || '#5CDD8B';
  } else {
    icon = '⏳'; desc = `**${name}** — pending`;
    route = 'daily';
    color = '#F59E0B';
  }

  const fields = [];
  if (msg) fields.push({ name: 'Message', value: msg.slice(0, 1024) });
  if (url) fields.push({ name: 'URL', value: url, inline: true });

  return [{
    route,
    embed: {
      title: `${icon} ${desc}`,
      color,
      thumbnail: sourceConfig.icon,
      fields: fields.length ? fields : undefined,
      footer: 'Uptime Kuma',
    },
  }];
};
