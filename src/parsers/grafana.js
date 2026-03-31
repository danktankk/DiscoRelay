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
      const summary = alert.annotations?.summary || '';
      const description = alert.annotations?.description || '';
      const instance = alert.labels?.instance || '';
      const nodename = alert.labels?.nodename || '';
      const containerName = alert.labels?.name || alert.labels?.container_name || '';
      const folder = alert.labels?.grafana_folder || '';

      // Determine the best host identifier
      // Skip unpoller/exporter scrape target IPs — not the actual device
      let host = '';
      if (nodename) {
        host = nodename;
      } else if (instance && !instance.includes(':9130') && !instance.includes(':9100') && !instance.includes(':9090')) {
        host = instance;
      } else if (containerName) {
        host = containerName;
      }

      const statusEmoji = firing ? (severity === 'critical' ? '\u{1F6A8}' : '\u26A0\uFE0F') : '\u2705';
      const statusText = firing ? (severity === 'critical' ? 'CRITICAL' : 'WARNING') : 'RESOLVED';

      // Title: clear and different for firing vs resolved
      let title;
      if (firing) {
        title = statusEmoji + ' ' + alertName;
      } else {
        title = '\u2705 ' + alertName + ' \u2014 Resolved';
      }

      // Build description
      const lines = [];

      if (firing) {
        if (summary) lines.push(summary);
      } else {
        // For resolved, pull the RESOLVED text from description
        if (description && description.includes('RESOLVED')) {
          const resolvedPart = description.split('RESOLVED')[1];
          if (resolvedPart) {
            lines.push(resolvedPart.replace(/^\s*[=:]\s*/, '').trim());
          } else {
            lines.push('Issue has been resolved.');
          }
        } else if (description) {
          lines.push(description);
        } else if (summary) {
          lines.push('No longer alerting: ' + summary);
        } else {
          lines.push('Issue has been resolved.');
        }
      }

      lines.push('');

      // Metadata
      const meta = [];
      if (host) meta.push('`' + host + '`');
      meta.push('**' + statusText + '**');
      if (meta.length) lines.push(meta.join('  \u00B7  '));

      // Extra context — skip noise
      const extras = [];
      if (alert.labels?.site_name && alert.labels.site_name !== 'Default (default)') {
        extras.push('\u{1F310} ' + alert.labels.site_name);
      }
      if (alert.labels?.job && !['node', 'unpoller', 'prometheus'].includes(alert.labels.job)) {
        extras.push('\u2699\uFE0F ' + alert.labels.job);
      }
      if (extras.length) lines.push(extras.join('  \u00B7  '));

      // Grafana link — only for firing alerts
      if (firing && alert.generatorURL) {
        lines.push('');
        lines.push('[View in Grafana \u2192](' + alert.generatorURL + ')');
      }

      const sourceIcon = config.sources?.grafana?.icon || '';

      const footerStatus = firing ? '\u{1F534}' : '\u{1F7E2}';
      const timeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: true });

      embeds.push({
        author: sourceIcon ? { name: 'Grafana', icon_url: sourceIcon } : undefined,
        title,
        description: lines.join('\n'),
        color: parseInt(color.replace('#', ''), 16),
        footer: { text: footerStatus + ' ' + statusText + '  \u00B7  ' + timeStr },
        timestamp: new Date().toISOString(),
        route: severity === 'critical' ? 'critical' : 'warning'
      });
    }

    return embeds;
  }
};
