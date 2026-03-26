module.exports = function parse(body, sourceConfig) {
  const alerts = body.alerts || [];
  const colors = sourceConfig.color || {};

  return alerts.map(alert => {
    const status = alert.status || 'firing';
    const severity = alert.labels?.severity || 'warning';
    const alertName = alert.labels?.alertname || 'Alert';
    const summary = alert.annotations?.summary || alert.annotations?.description || '';
    const instance = alert.labels?.instance || alert.labels?.host || '';

    const isResolved = status === 'resolved';
    const icon = isResolved ? '✅' : severity === 'critical' ? '🔴' : '⚠️';
    const color = isResolved ? (colors.resolved || '#22C55E')
      : (colors[severity] || colors.warning || '#F59E0B');

    let route;
    if (isResolved) route = 'daily';
    else if (severity === 'critical') route = 'critical';
    else route = 'warning';

    const fields = [];
    if (instance) fields.push({ name: 'Host', value: `\`${instance}\``, inline: true });
    fields.push({ name: 'Status', value: isResolved ? 'Resolved' : 'Firing', inline: true });
    if (severity && !isResolved) fields.push({ name: 'Severity', value: severity.charAt(0).toUpperCase() + severity.slice(1), inline: true });

    return {
      route,
      embed: {
        title: `${icon} ${alertName}`,
        description: summary || undefined,
        color,
        thumbnail: sourceConfig.icon,
        fields,
        footer: 'Grafana',
      },
    };
  });
};
