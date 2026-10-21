const { etTime } = require('../utils');

// Any script, cron job, playbook or app without a dedicated parser posts here.
// Body: { title, message, severity, source, host, url, fields, route, color }
// Also accepts Slack-shaped { text } (autoheal, many tools) and plain strings.
const SEVERITY_ROUTE = {
  critical: 'critical', emergency: 'critical', fatal: 'critical', alert: 'critical', panic: 'critical',
  error: 'warning', err: 'warning', warning: 'warning', warn: 'warning', high: 'warning', failed: 'warning', failure: 'warning',
  info: 'daily', information: 'daily', notice: 'daily', ok: 'daily', success: 'daily', resolved: 'daily',
  recovery: 'daily', recovered: 'daily', low: 'daily', normal: 'daily', debug: 'daily',
};
const COLORS = { critical: 0xDC2626, warning: 0xF59E0B, daily: 0x3B82F6, success: 0x22C55E };

function str(v) {
  if (v === undefined || v === null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function parseColor(c) {
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  const n = parseInt(String(c).replace('#', ''), 16);
  return Number.isNaN(n) ? COLORS.daily : n;
}

module.exports = {
  name: 'Generic',
  parse(body, config, ctx = {}) {
    if (typeof body === 'string') body = { message: body };
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be a JSON object');
    const query = ctx.query || {};

    const title = str(body.title || body.subject || body.summary || body.name || body.event || 'Notification');
    const message = str(body.message ?? body.description ?? body.text ?? body.content ?? body.msg ?? body.body ?? '');
    const severity = str(body.severity || body.level || body.priority || query.severity || 'info').toLowerCase();
    const appName = str(body.source || body.service || body.app || body.application || query.source || 'Generic');
    const host = str(body.host || body.hostname || body.node || query.host || '');
    const url = str(body.url || body.link || '');

    let route = str(body.route || query.route || '');
    if (!route || !(config.discord && config.discord[route])) route = SEVERITY_ROUTE[severity] || 'daily';

    const fields = [];
    if (host) fields.push({ name: 'Host', value: '`' + host + '`', inline: true });
    fields.push({ name: 'Severity', value: '**' + severity.toUpperCase() + '**', inline: true });

    const extra = body.fields;
    if (Array.isArray(extra)) {
      for (const f of extra.slice(0, 20)) {
        if (!f || f.name === undefined || f.name === null) continue;
        fields.push({ name: str(f.name).slice(0, 256), value: (str(f.value) || '—').slice(0, 1024), inline: f.inline !== false });
      }
    } else if (extra && typeof extra === 'object') {
      for (const [k, v] of Object.entries(extra).slice(0, 20)) {
        fields.push({ name: k.slice(0, 256), value: (str(v) || '—').slice(0, 1024), inline: true });
      }
    }
    if (url) fields.push({ name: 'Link', value: url.slice(0, 1024), inline: false });

    const isGood = /^(ok|success|resolved|recovery|recovered)$/.test(severity);
    const color = body.color !== undefined && body.color !== null
      ? parseColor(body.color)
      : (isGood ? COLORS.success : COLORS[route] || COLORS.daily);

    const icon = (config.sources && config.sources.generic && config.sources.generic.icon) || '';

    return [{
      author: icon ? { name: appName, icon_url: icon } : { name: appName },
      title: title.slice(0, 256),
      description: message ? message.slice(0, 4000) : undefined,
      url: /^https?:\/\//.test(url) ? url : undefined,
      color,
      fields: fields.slice(0, 25),
      footer: { text: `${appName}  ·  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route,
    }];
  },
};
