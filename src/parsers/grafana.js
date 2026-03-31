const { etTime } = require('../utils');

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

      let host = '';
      if (nodename) {
        host = nodename;
      } else if (instance && !instance.includes(':9130') && !instance.includes(':9100') && !instance.includes(':9090')) {
        host = instance;
      } else if (containerName) {
        host = containerName;
      }

      const statusText = firing ? (severity === 'critical' ? 'CRITICAL' : 'WARNING') : 'RESOLVED';
      const authorLabel = firing ? statusText : 'Resolved';

      // Build description
      const lines = [];
      if (firing) {
        if (summary) lines.push(summary);
      } else {
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

      // Fields — Notifiarr style inline triplets
      const fields = [];
      if (host) fields.push({ name: 'Host', value: '`' + host + '`', inline: true });
      fields.push({ name: 'Status', value: '**' + statusText + '**', inline: true });
      if (folder) fields.push({ name: 'Folder', value: folder, inline: true });

      const extras = [];
      if (alert.labels?.site_name && alert.labels.site_name !== 'Default (default)') {
        extras.push({ name: 'Site', value: alert.labels.site_name, inline: true });
      }
      if (alert.labels?.job && !['node', 'unpoller', 'prometheus'].includes(alert.labels.job)) {
        extras.push({ name: 'Job', value: alert.labels.job, inline: true });
      }
      fields.push(...extras);

      if (firing && alert.generatorURL) {
        fields.push({ name: 'Link', value: '[View in Grafana \u2192](' + alert.generatorURL + ')', inline: false });
      }

      const sourceIcon = config.sources?.grafana?.icon || '';

      embeds.push({
        author: sourceIcon ? { name: `${authorLabel} — Grafana`, icon_url: sourceIcon } : { name: `${authorLabel} — Grafana` },
        title: alertName,
        description: lines.join('\n'),
        color: parseInt(color.replace('#', ''), 16),
        fields,
        footer: { text: etTime() },
        timestamp: new Date().toISOString(),
        route: severity === 'critical' ? 'critical' : 'warning'
      });
    }

    return embeds;
  }
};
