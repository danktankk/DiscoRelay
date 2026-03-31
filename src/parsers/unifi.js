const { etTime } = require('../utils');

module.exports = {
  name: 'UniFi',
  parse(body, config) {
    // UniFi controller webhook / log-based events
    // Supports: direct webhook, syslog relay, or custom event forwarding
    const entries = Array.isArray(body) ? body : (body.entries || body.events || body.data || [body]);
    const embeds = [];

    for (const entry of entries) {
      const event = entry.key || entry.event || entry.msg || entry.message || 'Event';
      const subsystem = (entry.subsystem || entry.category || entry.type || '').toLowerCase();
      const severity = (entry.severity || entry.level || entry.priority || 'info').toLowerCase();
      const siteName = entry.site_name || entry.site || '';
      const hostname = entry.hostname || entry.device_name || entry.ap_name || entry.sw_name || entry.gw_name || '';
      const ip = entry.ip || entry.src_ip || entry.client_ip || entry.device_ip || '';
      const mac = entry.mac || entry.client_mac || entry.device_mac || '';
      const message = entry.msg || entry.message || entry.description || '';
      const timestamp = entry.time || entry.datetime || entry.timestamp || '';
      const ssid = entry.ssid || entry.network || '';
      const channel = entry.channel || '';
      const experience = entry.experience || '';
      const clientName = entry.client_name || entry.guest_name || entry.user || '';

      // Severity-based routing and color
      let color, route;
      switch (severity) {
        case 'critical':
        case 'emergency':
        case 'alert':
          color = 0xDC2626;
          route = 'critical';
          break;
        case 'warning':
        case 'warn':
          color = 0xF59E0B;
          route = 'warning';
          break;
        case 'error':
        case 'err':
          color = 0xE74C3C;
          route = 'warning';
          break;
        default:
          color = 0x3498DB;
          route = 'daily';
      }

      // Subsystem-based icon/label
      const subsystemLabels = {
        wlan: 'WiFi', lan: 'LAN', wan: 'WAN', vpn: 'VPN',
        ips: 'IPS/IDS', firewall: 'Firewall', fw: 'Firewall',
        switch: 'Switch', ap: 'Access Point', uap: 'Access Point',
        usw: 'Switch', ugw: 'Gateway', udm: 'Gateway',
        radius: 'RADIUS', dhcp: 'DHCP', dns: 'DNS',
        speedtest: 'Speed Test', system: 'System',
        admin: 'Admin', client: 'Client', device: 'Device'
      };
      const subsystemLabel = subsystemLabels[subsystem] || subsystem || 'Network';

      // IPS/IDS events get elevated to warning
      if (subsystem === 'ips' && route === 'daily') {
        route = 'warning';
        color = 0xF59E0B;
      }

      const fields = [];

      // Subsystem / Severity / Site triplet
      fields.push({ name: 'Subsystem', value: subsystemLabel, inline: true });
      fields.push({ name: 'Severity', value: '**' + severity.toUpperCase() + '**', inline: true });
      if (siteName) fields.push({ name: 'Site', value: siteName, inline: true });

      // Device / IP / MAC triplet
      if (hostname) fields.push({ name: 'Device', value: '`' + hostname + '`', inline: true });
      if (ip) fields.push({ name: 'IP', value: '`' + ip + '`', inline: true });
      if (mac) fields.push({ name: 'MAC', value: '`' + mac + '`', inline: true });

      // WiFi-specific fields
      if (ssid || channel || experience) {
        if (ssid) fields.push({ name: 'SSID', value: ssid, inline: true });
        if (channel) fields.push({ name: 'Channel', value: String(channel), inline: true });
        if (experience) fields.push({ name: 'Experience', value: String(experience) + '%', inline: true });
      }

      // Client info
      if (clientName) {
        fields.push({ name: 'Client', value: clientName, inline: true });
      }

      const sourceIcon = config.sources?.unifi?.icon || '';
      const authorName = `${subsystemLabel} — UniFi`;

      embeds.push({
        author: sourceIcon ? { name: authorName, icon_url: sourceIcon } : { name: authorName },
        title: event.substring(0, 256),
        description: message ? message.substring(0, 500) : undefined,
        color,
        fields,
        footer: { text: `UniFi  \u00B7  ${etTime()}` },
        timestamp: new Date().toISOString(),
        route
      });
    }

    return embeds;
  }
};
