const { etTime } = require('../utils');

module.exports = {
  name: 'Backrest',
  parse(body, config) {
    const event = body.event || '';
    const plan = body.plan || '';
    const repo = body.repo || '';
    const snapshot = body.snapshot || '';
    const error = body.error || '';
    const time = body.time || '';
    const stats = body.stats || {};

    const isError = !!error || event.toLowerCase().includes('error') || event.toLowerCase().includes('fail');
    const isWarning = event.toLowerCase().includes('warning') || event.toLowerCase().includes('warn');

    let statusText, color, route;
    if (isError) {
      statusText = 'BACKUP FAILED';
      color = 0xDC2626;
      route = 'critical';
    } else if (isWarning) {
      statusText = 'BACKUP WARNING';
      color = 0xF59E0B;
      route = 'warning';
    } else {
      statusText = 'BACKUP SUCCESS';
      color = 0x22C55E;
      route = 'backups';
    }

    const sourceIcon = config.sources?.backrest?.icon || '';

    const fields = [];

    // Inline triplet: plan / repo / event
    if (plan) fields.push({ name: 'Plan', value: plan, inline: true });
    if (repo) fields.push({ name: 'Repository', value: repo, inline: true });
    if (event) fields.push({ name: 'Event', value: event, inline: true });

    // Stats triplet: data added / files / total size
    if (stats.data_added) fields.push({ name: 'Data Added', value: stats.data_added, inline: true });
    if (stats.total_files) fields.push({ name: 'Files', value: String(stats.total_files).replace(/\B(?=(\d{3})+(?!\d))/g, ','), inline: true });
    if (stats.total_bytes) fields.push({ name: 'Total Size', value: stats.total_bytes, inline: true });

    // Changes triplet: new / changed / duration
    if (stats.files_new != null) fields.push({ name: 'New', value: String(stats.files_new).replace(/\B(?=(\d{3})+(?!\d))/g, ','), inline: true });
    if (stats.files_changed != null) fields.push({ name: 'Changed', value: String(stats.files_changed).replace(/\B(?=(\d{3})+(?!\d))/g, ','), inline: true });
    if (stats.duration_secs != null) fields.push({ name: 'Duration', value: `${Number(stats.duration_secs).toFixed(1)}s`, inline: true });

    if (snapshot) fields.push({ name: 'Snapshot', value: '`' + snapshot.substring(0, 16) + '`', inline: false });
    if (error) fields.push({ name: 'Error', value: '```\n' + error.substring(0, 500) + '\n```', inline: false });

    return [{
      author: sourceIcon ? { name: `${statusText} — Backrest`, icon_url: sourceIcon } : { name: `${statusText} — Backrest` },
      title: plan || repo || 'Backup',
      color,
      fields,
      footer: { text: `Backrest  \u00B7  ${etTime()}` },
      timestamp: new Date().toISOString(),
      route
    }];
  }
};
