const { etTime } = require('../utils');
const { osmTile } = require('../geoip');

// CrowdSec HTTP notification plugin. Works with the plain alert JSON (`{{ .|toJson }}`) and with the
// flattened template DiscoRelay ships (ip, scenario, action, duration, events_count, message, source, labels,
// machine, start_at, stop_at). Enriched with GeoIP + an OpenStreetMap tile when the hub has it enabled.
const ACTION_COLORS = { ban: 0xDC2626, captcha: 0xF59E0B, throttle: 0xF59E0B };

function hostOf(item, decision) {
  return item.machine || item.machine_id || item.MachineID || decision.machine || '';
}

function spanSeconds(a, b) {
  const s = Date.parse(a), e = Date.parse(b);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  return Math.round((e - s) / 1000);
}

module.exports = {
  name: 'CrowdSec',
  async parse(body, config, ctx = {}) {
    const decisions = Array.isArray(body) ? body : (body.decisions || body.alerts || [body]);
    const cfg = (config.sources && config.sources.crowdsec) || {};
    const geoCfg = config.geoip || {};
    const geoip = ctx.services && ctx.services.geoip;
    const embeds = [];

    for (const item of decisions) {
      if (!item || typeof item !== 'object') continue;
      const decision = item.decision || (Array.isArray(item.decisions) && item.decisions[0]) || item;
      const source = item.source || decision.source || {};
      const ip = decision.value || source.ip || item.ip || source.value || 'Unknown IP';
      const rawScenario = decision.scenario || item.scenario || source.scenario || item.scenario_name || 'Unknown';
      const scenario = /^(ip|range|as|country)\//i.test(rawScenario) ? rawScenario.split('/').slice(1).join('/') : rawScenario;
      const action = String(decision.type || item.action || 'ban').toLowerCase();
      const duration = decision.duration || item.duration || '';
      const scope = String(decision.scope || item.scope || 'ip').toLowerCase();
      const origin = decision.origin || item.origin || '';
      const eventsCount = item.events_count || item.events || '';
      const startedAt = item.start_at || item.started_at || item.StartAt || '';
      const stoppedAt = item.stop_at || item.stopped_at || item.StopAt || '';
      const host = hostOf(item, decision);
      const logType = (item.labels && item.labels.type) || source.type || '';
      const service = (item.labels && item.labels.service) || '';
      const targetFqdn = (item.labels && item.labels.target_fqdn) || item.target_fqdn || '';
      const sourcePath = (item.labels && item.labels.source_path) || '';

      // GeoIP: payload-provided first, then the hub's own lookup.
      let geo = item.geo || item.location || null;
      if (!geo && geoip && geoCfg.enabled !== false && scope === 'ip') geo = await geoip.lookup(ip);
      geo = geo || {};
      const country = geo.country || '';
      const region = geo.region || geo.regionName || geo.state || '';
      const city = geo.city || '';
      const isp = geo.isp || '';
      const org = geo.org || geo.as_name || geo.asn_org || '';
      const asn = geo.as || geo.asn || geo.as_number || '';
      const range = geo.range || geo.ip_range || (source.range ? String(source.range) : '');

      const span = spanSeconds(startedAt, stoppedAt);
      const when = stoppedAt || startedAt || '';
      const overText = eventsCount ? `(${eventsCount} event${Number(eventsCount) === 1 ? '' : 's'}${span !== null ? ` over ${span}s` : ''})` : '';
      const description = item.message && !/triggered/.test(item.message)
        ? item.message
        : `Ip \`${ip}\` performed \`${scenario}\` ${overText}${when ? ` at ${when}` : ''}`.replace(/\s+/g, ' ').trim();

      const fields = [];
      if (service) fields.push({ name: 'Service', value: service, inline: true });
      if (targetFqdn) fields.push({ name: 'Target Domain', value: targetFqdn, inline: true });
      if (sourcePath) fields.push({ name: 'Source path', value: sourcePath, inline: true });
      if (logType) fields.push({ name: 'Log type', value: logType, inline: true });
      fields.push({ name: 'Scenario', value: scenario, inline: true });
      if (org || isp) fields.push({ name: 'Org', value: org || isp, inline: true });
      if (eventsCount) fields.push({ name: 'Events', value: String(eventsCount), inline: true });
      if (origin && !service) fields.push({ name: 'Origin', value: origin, inline: true });
      if (scope !== 'ip') fields.push({ name: 'Scope', value: scope, inline: true });

      const details = [];
      if (country) details.push(`Country: ${country}`);
      if (region) details.push(`State: ${region}`);
      if (city) details.push(`City: ${city}`);
      if (isp) details.push(`ISP: ${isp}`);
      if (asn) details.push(`ASN: ${asn}`);
      if (range) details.push(`range: ${range}`);
      if (duration) details.push(`Ban length: ${duration}`);
      if (eventsCount) details.push(`Failures: ${eventsCount}`);
      const detailsValue = `IP: [${ip}](https://www.abuseipdb.com/check/${encodeURIComponent(ip)})` +
        (details.length ? '\n```\n' + details.join('\n') + '\n```' : (duration ? `\nBan length: ${duration}` : ''));
      fields.push({ name: 'Details', value: detailsValue.slice(0, 1024), inline: false });

      const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
      const title = `${actionLabel} on ${host || (scope === 'ip' ? ip : (source.value || ip))}`;
      const icon = cfg.icon || '';
      const embed = {
        author: icon ? { name: 'CrowdSec', icon_url: icon } : { name: 'CrowdSec' },
        title: title.slice(0, 256),
        description: description.slice(0, 2000),
        color: ACTION_COLORS[action] || 0xDC2626,
        fields,
        footer: { text: `CrowdSec  ·  ${etTime()}` },
        timestamp: new Date().toISOString(),
        route: cfg.route && cfg.route !== 'auto' ? cfg.route : 'warning',
      };
      if (geoCfg.map !== false && typeof geo.lat === 'number' && typeof geo.lon === 'number') {
        embed.image = { url: osmTile(geo.lat, geo.lon, geoCfg.zoom || 10) };
        embed.footer.text = `CrowdSec  ·  map © OpenStreetMap contributors  ·  ${etTime()}`;
      }
      embeds.push(embed);
    }

    return embeds.length ? embeds : [{
      author: { name: 'CrowdSec' },
      title: 'CrowdSec Notification',
      description: JSON.stringify(body).substring(0, 500),
      color: 0xDC2626,
      footer: { text: `CrowdSec  ·  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route: 'warning',
    }];
  },
};
