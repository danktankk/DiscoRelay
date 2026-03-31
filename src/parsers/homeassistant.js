const { etTime } = require('../utils');

module.exports = {
  name: 'Home Assistant',
  parse(body, config) {
    const title = body.title || body.name || 'Home Assistant';
    const message = body.message || body.data?.message || '';
    const severity = (body.severity || body.level || body.data?.severity || 'info').toLowerCase();
    const entity = body.entity_id || body.data?.entity_id || '';
    const state = body.state || body.data?.state || '';
    const oldState = body.old_state || body.data?.old_state || '';
    const domain = body.domain || '';
    const area = body.area || body.data?.area || '';
    const automationName = body.automation || body.data?.automation || '';
    const triggerEntity = body.trigger_entity || body.data?.trigger_entity || '';

    const colors = config.sources?.homeassistant?.color || {};

    let color, route;
    switch (severity) {
      case 'critical':
      case 'emergency':
        color = parseInt((colors.critical || '#DC2626').replace('#', ''), 16);
        route = 'critical';
        break;
      case 'warning':
      case 'warn':
        color = parseInt((colors.warning || '#F59E0B').replace('#', ''), 16);
        route = 'warning';
        break;
      case 'recovery':
      case 'resolved':
        color = parseInt((colors.recovery || '#22C55E').replace('#', ''), 16);
        route = 'daily';
        break;
      default:
        color = parseInt((colors.info || '#3B82F6').replace('#', ''), 16);
        route = 'daily';
    }

    const fields = [];

    // Severity / Domain / Area triplet
    fields.push({ name: 'Severity', value: '**' + severity.toUpperCase() + '**', inline: true });
    if (domain) fields.push({ name: 'Domain', value: domain, inline: true });
    if (area) fields.push({ name: 'Area', value: area, inline: true });

    // Entity / State
    if (entity) fields.push({ name: 'Entity', value: '`' + entity + '`', inline: true });
    if (state) fields.push({ name: 'State', value: state, inline: true });
    if (oldState) fields.push({ name: 'Previous', value: oldState, inline: true });

    // Automation info
    if (automationName) fields.push({ name: 'Automation', value: automationName, inline: true });
    if (triggerEntity) fields.push({ name: 'Trigger', value: '`' + triggerEntity + '`', inline: true });

    const sourceIcon = config.sources?.homeassistant?.icon || '';

    return [{
      author: sourceIcon ? { name: 'Home Assistant', icon_url: sourceIcon } : { name: 'Home Assistant' },
      title,
      description: message || undefined,
      color,
      fields,
      footer: { text: `Home Assistant  \u00B7  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route
    }];
  }
};
