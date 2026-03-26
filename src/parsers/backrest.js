module.exports = {
  name: 'Backrest',
  parse(body, config) {
    const event = body.event || '';
    const plan = body.plan || '';
    const repo = body.repo || '';
    const task = body.task || '';
    const snapshot = body.snapshot || '';
    const hasError = body.has_error || body.error || false;
    const error = body.error || '';
    const time = body.time || '';
    const stats = body.stats || {};

    // Success/failure — big and obvious
    const isError = !!hasError || event.toLowerCase().includes('error') || event.toLowerCase().includes('fail');
    const isWarning = event.toLowerCase().includes('warning') || event.toLowerCase().includes('warn');
    const isSuccess = !isError && !isWarning;

    let statusIcon, statusText, color;
    if (isError) {
      statusIcon = '🔴';
      statusText = 'BACKUP FAILED';
      color = 0xDC2626;
    } else if (isWarning) {
      statusIcon = '🟡';
      statusText = 'BACKUP WARNING';
      color = 0xF59E0B;
    } else {
      statusIcon = '🟢';
      statusText = 'BACKUP SUCCESS';
      color = 0x22C55E;
    }

    const fields = [];
    if (plan) fields.push({ name: 'Plan', value: plan, inline: true });
    if (repo) fields.push({ name: 'Repository', value: repo, inline: true });
    if (event) fields.push({ name: 'Event', value: event, inline: true });
    if (stats.data_added_pretty) fields.push({ name: 'Data Added', value: stats.data_added_pretty, inline: true });
    if (stats.total_files) fields.push({ name: 'Files Processed', value: String(stats.total_files).replace(/\B(?=(\d{3})+(?!\d))/g, ','), inline: true });
    if (stats.total_bytes_pretty) fields.push({ name: 'Total Size', value: stats.total_bytes_pretty, inline: true });
    if (stats.files_new) fields.push({ name: 'New Files', value: String(stats.files_new).replace(/\B(?=(\d{3})+(?!\d))/g, ','), inline: true });
    if (stats.files_changed) fields.push({ name: 'Changed Files', value: String(stats.files_changed).replace(/\B(?=(\d{3})+(?!\d))/g, ','), inline: true });
    const duration = stats.duration || (stats.duration_secs ? `${Number(stats.duration_secs).toFixed(1)}s` : '');
    if (duration) fields.push({ name: 'Duration', value: duration, inline: true });
    if (snapshot) fields.push({ name: 'Snapshot', value: snapshot.substring(0, 16), inline: false });

    const sourceIcon = config.sources?.backrest?.icon || '';

    return [{
      author: sourceIcon ? { name: 'Backrest', icon_url: sourceIcon } : undefined,
      title: `${statusIcon} ${statusText}: ${plan || repo || 'unknown'}`,
      description: error || undefined,
      color,
      fields,
      footer: { text: time || 'Backrest' },
      timestamp: new Date().toISOString(),
      route: isError ? 'critical' : isWarning ? 'warning' : 'backups'
    }];
  }
};
