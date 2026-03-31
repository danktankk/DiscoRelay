const { etTime } = require('../utils');

module.exports = {
  name: 'UnRAID',
  parse(body, config) {
    const event = body.event || 'Notification';
    const subject = body.subject || 'Notification';
    const description = body.description || '';
    const content = body.content || '';
    const importance = (body.importance || 'normal').toLowerCase();
    const link = body.link || '';
    const hostname = body.hostname || 'UnRAID';

    let color, route;
    switch (importance) {
      case 'alert':
        color = 0xE23636;
        route = 'critical';
        break;
      case 'warning':
        color = 0xFFAA2C;
        route = 'warning';
        break;
      default:
        color = 0x0099FF;
        route = 'daily';
    }

    const parts = [];
    if (description) parts.push(description);
    if (content) parts.push(content);
    const fullDesc = parts.join('\n\n') || undefined;

    const fields = [];
    fields.push({ name: 'Priority', value: importance, inline: true });
    fields.push({ name: 'Event', value: event, inline: true });
    if (link) fields.push({ name: 'Link', value: '[Open \u2192](' + link + ')', inline: true });

    const sourceIcon = config.sources?.unraid?.icon || '';

    return [{
      author: sourceIcon ? { name: hostname, icon_url: sourceIcon } : { name: hostname },
      title: subject,
      description: fullDesc,
      color,
      fields,
      footer: { text: `UnRAID  \u00B7  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route
    }];
  }
};
