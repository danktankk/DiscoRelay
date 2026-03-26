module.exports = {
  name: 'Grafana',
  parse(body, config) {
    const embeds = [];
    const alerts = body.alerts || [];

    for (const alert of alerts) {
      const firing = alert.status === 'firing';
      const severity = (alert.labels?.severity || 'info').toLowerCase();
      const colors = config.sources?.grafana?.color || {};
      const color = firing
        ? (severity === 'critical' ? colors.critical || '#DC2626' : colors.warning || '#F59E0B')
        : (colors.resolved || '#22C55E');

      const alertName = alert.labels?.alertname || 'Alert';
      const summary = alert.annotations?.summary || alert.annotations?.description || '';
      const host = alert.labels?.instance || alert.labels?.nodename || alert.labels?.name || '';
      const folder = alert.labels?.grafana_folder || '';

      // Status line with contextual emoji
      const statusEmoji = firing ? (severity === 'critical' ? '🚨' : '⚠️') : '✅';
      const statusText = firing ? (severity === 'critical' ? 'CRITICAL' : 'WARNING') : 'RESOLVED';

      // Build rich description
      const lines = [];
      if (summary) lines.push(summary);
      lines.push('');

      // Metadata line — compact, modern
      const meta = [];
      if (host) meta.push(`🖥️ \`${host}\``);
      meta.push(`${statusEmoji} **${statusText}**`);
      if (folder) meta.push(`📁 ${folder}`);
      if (meta.length) lines.push(meta.join('  ·  '));

      // Extra labels that might be useful
      const extras = [];
      if (alert.labels?.site_name) extras.push(`🌐 ${alert.labels.site_name}`);
      if (alert.labels?.container_name) extras.push(`📦 ${alert.labels.container_name}`);
      if (alert.labels?.job) extras.push(`⚙️ ${alert.labels.job}`);
      if (extras.length) lines.push(extras.join('  ·  '));

      // Grafana link
      if (alert.generatorURL) {
        lines.push('');
        lines.push(`[View in Grafana →](${alert.generatorURL})`);
      }

      const sourceIcon = config.sources?.grafana?.icon || '';

      embeds.push({
        author: sourceIcon ? { name: 'Grafana', icon_url: sourceIcon } : undefined,
        title: `${firing ? '🔥' : '✅'} ${alertName}`,
        description: lines.join('\n'),
        color: parseInt(color.replace('#', ''), 16),
        footer: { text: `${firing ? '🔴' : '🟢'} ${statusText}  ·  ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}` },
        timestamp: new Date().toISOString(),
        route: severity === 'critical' ? 'critical' : 'warning'
      });
    }

    return embeds;
  }
};
