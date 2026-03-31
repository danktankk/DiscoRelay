module.exports = {
  name: 'UnRAID',
  parse(body, config) {
    const event = body.event || 'Unraid Status';
    const subject = body.subject || 'Notification';
    const description = body.description || '';
    const content = body.content || '';
    const importance = (body.importance || 'normal').toLowerCase();
    const link = body.link || '';
    const hostname = body.hostname || 'UnRAID';

    // Map importance to colors and status
    let color, statusIcon, route;
    switch (importance) {
      case 'alert':
        color = 0xE23636;
        statusIcon = '🚨';
        route = 'critical';
        break;
      case 'warning':
        color = 0xFFAA2C;
        statusIcon = '⚠️';
        route = 'warning';
        break;
      default:
        color = 0x39208;
        statusIcon = 'ℹ️';
        route = 'daily';
    }

    // Build description from description + content
    const parts = [];
    if (description) parts.push(description);
    if (content) parts.push(content);
    const fullDesc = parts.join('\n\n') || undefined;

    const fields = [];
    fields.push({ name: 'Priority', value: importance, inline: true });
    if (link) fields.push({ name: 'Link', value: `[Open →](${link})`, inline: true });

    const sourceIcon = config.sources?.unraid?.icon || 'https://craftassets.unraid.net/uploads/logos/un-mark-gradient@2x.png';

    return [{
      author: { name: hostname, icon_url: sourceIcon },
      title: `${statusIcon} ${event}: ${subject}`,
      description: fullDesc,
      color,
      fields,
      footer: { text: `UnRAID  ·  ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}` },
      timestamp: new Date().toISOString(),
      route
    }];
  }
};
