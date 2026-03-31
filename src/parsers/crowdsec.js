const { etTime } = require('../utils');

module.exports = {
  name: 'CrowdSec',
  parse(body, config) {
    // CrowdSec notification HTTP plugin sends decision data
    // Can receive single decision or array
    const decisions = Array.isArray(body) ? body : (body.decisions || body.alerts || [body]);
    const embeds = [];

    for (const item of decisions) {
      // Handle both alert format and decision format
      const decision = item.decision || item;
      const source = item.source || decision.source || {};
      const ip = decision.value || source.ip || item.ip || 'Unknown IP';
      const scenario = decision.scenario || source.scenario || item.scenario || 'Unknown';
      const action = (decision.type || item.action || 'ban').toLowerCase();
      const duration = decision.duration || item.duration || '';
      const scope = decision.scope || item.scope || 'ip';
      const origin = decision.origin || item.origin || '';
      const events_count = item.events_count || item.events || '';
      const startedAt = item.start_at || item.started_at || '';
      const stoppedAt = item.stop_at || item.stopped_at || '';
      const message = item.message || '';

      // Scenario parts for display
      const scenarioParts = scenario.split('/');
      const scenarioShort = scenarioParts[scenarioParts.length - 1] || scenario;
      const scenarioOrg = scenarioParts.length > 1 ? scenarioParts[0] : '';

      // Source metadata
      const sourceScope = source.scope || '';
      const sourceValue = source.value || '';
      const logType = item.labels?.type || source.type || '';
      const service = item.labels?.service || '';

      // GeoIP data if provided
      const geo = item.geo || item.location || {};
      const country = geo.country || '';
      const city = geo.city || '';
      const asn = geo.as_name || geo.asn_org || geo.org || '';
      const asNumber = geo.as_number || geo.asn || '';
      const ipRange = geo.range || geo.ip_range || '';
      const isp = geo.isp || '';

      // Color by action
      const actionColors = {
        ban: 0xDC2626,
        captcha: 0xF59E0B,
        throttle: 0xF59E0B
      };
      const color = actionColors[action] || 0xDC2626;

      const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

      // Build fields — Notifiarr CrowdSec style
      const fields = [];

      // Service / source / log type triplet
      if (service || logType || origin) {
        if (service) fields.push({ name: 'Service', value: service, inline: true });
        if (logType) fields.push({ name: 'Log Type', value: logType, inline: true });
        if (origin) fields.push({ name: 'Origin', value: origin, inline: true });
      }

      // Scenario / org / events triplet
      fields.push({ name: 'Scenario', value: '`' + scenario + '`', inline: true });
      if (asn) fields.push({ name: 'Org', value: asn, inline: true });
      if (events_count) fields.push({ name: 'Events', value: String(events_count), inline: true });

      // IP link
      fields.push({ name: 'IP', value: `[${ip}](https://www.abuseipdb.com/check/${ip})`, inline: true });
      if (duration) fields.push({ name: 'Duration', value: duration, inline: true });
      if (scope !== 'ip') fields.push({ name: 'Scope', value: scope, inline: true });

      // GeoIP block — Notifiarr uses code block for this
      const geoLines = [];
      if (country) geoLines.push(`Country: ${country}`);
      if (city) geoLines.push(`City: ${city}`);
      if (isp) geoLines.push(`ISP: ${isp}`);
      if (asNumber) geoLines.push(`ASN: ${asNumber}`);
      if (ipRange) geoLines.push(`Range: ${ipRange}`);
      if (duration) geoLines.push(`Ban length: ${duration}`);
      if (events_count) geoLines.push(`Failures: ${events_count}`);

      if (geoLines.length) {
        fields.push({ name: 'Details', value: '```\n' + geoLines.join('\n') + '\n```', inline: false });
      }

      const sourceIcon = config.sources?.crowdsec?.icon || '';

      embeds.push({
        author: sourceIcon ? { name: 'CrowdSec', icon_url: sourceIcon } : { name: 'CrowdSec' },
        title: `${actionLabel} on ${scope === 'ip' ? ip : sourceValue || ip}`,
        description: message || `IP \`${ip}\` triggered \`${scenarioShort}\``,
        color,
        fields,
        footer: { text: `CrowdSec  \u00B7  ${etTime()}` },
        timestamp: new Date().toISOString(),
        route: 'warning'
      });
    }

    return embeds.length ? embeds : [{
      author: { name: 'CrowdSec' },
      title: 'CrowdSec Notification',
      description: JSON.stringify(body).substring(0, 500),
      color: 0xDC2626,
      footer: { text: `CrowdSec  \u00B7  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route: 'warning'
    }];
  }
};
