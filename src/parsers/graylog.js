const { etTime } = require('../utils');

// Graylog "HTTP Notification" (default JSON body):
// { event_definition_title, event_definition_description, event: { message, source, timestamp, priority(1-3), key, fields }, backlog: [...] }
const PRIORITY_LABEL = { 1: 'Low', 2: 'Normal', 3: 'High' };

module.exports = {
  name: 'Graylog',
  parse(body, config) {
    if (!body || typeof body !== 'object') throw new Error('body must be a Graylog notification JSON object');
    const ev = body.event && typeof body.event === 'object' ? body.event : {};
    const title = String(body.event_definition_title || ev.message || 'Graylog event');
    const message = String(ev.message || body.event_definition_description || '');
    const priority = Number(ev.priority ?? 2);
    const route = priority >= 3 ? 'critical' : priority === 2 ? 'warning' : 'daily';
    const color = route === 'critical' ? 0xDC2626 : route === 'warning' ? 0xF59E0B : 0x3B82F6;

    const fields = [];
    fields.push({ name: 'Priority', value: PRIORITY_LABEL[priority] || String(priority), inline: true });
    if (ev.source) fields.push({ name: 'Source', value: '`' + String(ev.source).slice(0, 200) + '`', inline: true });
    if (ev.key) fields.push({ name: 'Key', value: String(ev.key).slice(0, 1024), inline: true });
    if (ev.timestamp) fields.push({ name: 'Event time', value: String(ev.timestamp).slice(0, 19).replace('T', ' ') + ' UTC', inline: true });
    if (ev.fields && typeof ev.fields === 'object') {
      for (const [k, v] of Object.entries(ev.fields).slice(0, 6)) {
        fields.push({ name: k.slice(0, 256), value: (String(v) || '—').slice(0, 1024), inline: true });
      }
    }
    const backlog = Array.isArray(body.backlog) ? body.backlog : [];
    if (backlog.length) {
      const lines = backlog.slice(0, 3).map(m => {
        const ts = String(m.timestamp || '').slice(11, 19);
        return `${ts} ${m.source || ''} ${m.message || ''}`.trim().slice(0, 300);
      });
      fields.push({ name: `Backlog (${backlog.length})`, value: '```\n' + lines.join('\n').slice(0, 1000) + '\n```', inline: false });
    }

    const icon = (config.sources && config.sources.graylog && config.sources.graylog.icon) || '';
    return [{
      author: icon ? { name: 'Graylog', icon_url: icon } : { name: 'Graylog' },
      title: title.slice(0, 256),
      description: message && message !== title ? message.slice(0, 2000) : undefined,
      color,
      fields,
      footer: { text: `Graylog  ·  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route,
    }];
  },
};
