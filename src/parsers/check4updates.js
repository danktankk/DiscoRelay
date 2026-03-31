module.exports = {
  name: 'check4updates',
  parse(body, config) {
    const hostname = body.hostname || 'Unknown';
    const services = body.services || [];
    const avatarUrl = body.avatar_url || '';
    const thumbnailUrl = body.thumbnail_url || '';
    const footerIconUrl = body.footer_icon_url || '';

    const updates = services.filter(s => s.status === 'Update available').sort((a, b) => a.service.localeCompare(b.service));
    const current = services.filter(s => s.status === 'Up to date').sort((a, b) => a.service.localeCompare(b.service));
    const other = services.filter(s => s.status !== 'Update available' && s.status !== 'Up to date').sort((a, b) => a.service.localeCompare(b.service));
    const hasUpdates = updates.length > 0;

    const lines = [];

    // Updates section — prominent
    if (updates.length > 0) {
      lines.push(`### ⚠️ Updates Available (${updates.length})`);
      for (const s of updates) {
        lines.push(`> 🔸 **${s.service}** \`${s.current_digest}\` → \`${s.remote_digest}\``);
        lines.push(`>    ᴘʀᴏᴊᴇᴄᴛ ${s.project}`);
      }
      lines.push('');
    }

    // Up to date — compact list
    if (current.length > 0) {
      lines.push(`### ✅ Up to Date (${current.length})`);
      const names = current.map(s => `\`${s.service}\``);
      // Wrap into rows of ~6 for readability
      for (let i = 0; i < names.length; i += 6) {
        lines.push('> ' + names.slice(i, i + 6).join(' · '));
      }
      lines.push('');
    }

    // Other statuses (REMOTE UNAVAILABLE etc)
    if (other.length > 0) {
      lines.push(`### ❓ Other (${other.length})`);
      for (const s of other) {
        lines.push(`> \`${s.service}\` — ${s.status}`);
      }
    }

    const description = lines.join('\n').substring(0, 4090);
    const color = hasUpdates ? 0xFFAA2C : 0x2ECC71;
    const statusIcon = hasUpdates ? '⚠️' : '✅';
    const sourceIcon = config.sources?.check4updates?.icon || footerIconUrl;

    return [{
      author: avatarUrl ? { name: `check4updates.sh (${hostname})`, icon_url: avatarUrl } : undefined,
      title: `${statusIcon} ${hostname} — ${hasUpdates ? updates.length + ' update' + (updates.length > 1 ? 's' : '') + ' available' : 'all up to date'}`,
      description,
      color,
      thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
      footer: {
        text: `${current.length} current · ${updates.length} updates · ${other.length} other`,
        icon_url: sourceIcon || undefined
      },
      timestamp: new Date().toISOString(),
      route: 'updates'
    }];
  }
};
