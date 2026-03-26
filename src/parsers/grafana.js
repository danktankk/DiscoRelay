module.exports = {
  name: 'Grafana',
  parse(body, config) {
    const embeds = [];
    const alerts = body.alerts || [];
    
    for (const alert of alerts) {
      const firing = alert.status === 'firing';
      const severity = alert.labels?.severity || 'info';
      const colors = config.sources?.grafana?.color || {};
      const color = firing 
        ? (severity === 'critical' ? colors.critical || '#DC2626' : colors.warning || '#F59E0B')
        : (colors.resolved || '#22C55E');
      
      embeds.push({
        title: `${firing ? '🔥' : '✅'} ${alert.labels?.alertname || 'Alert'}`,
        description: alert.annotations?.summary || 'No details',
        color: parseInt(color.replace('#', ''), 16),
        fields: [
          { name: 'Host', value: alert.labels?.instance || alert.labels?.nodename || alert.labels?.name || '—', inline: true },
          { name: 'Severity', value: severity.toUpperCase(), inline: true },
          { name: 'Status', value: firing ? '🔴 FIRING' : '🟢 RESOLVED', inline: true }
        ],
        thumbnail: { url: config.sources?.grafana?.icon || '' },
        footer: { text: `Grafana • ${alert.labels?.grafana_folder || 'Alerts'}` },
        timestamp: new Date().toISOString(),
        route: severity === 'critical' ? 'critical' : 'warning'
      });
    }
    
    return embeds;
  }
};
