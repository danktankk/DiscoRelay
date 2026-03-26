module.exports = {
  name: 'Backrest',
  parse(body, config) {
    // Backrest webhook payload — handle multiple possible formats
    const event = body.event || body.type || body.Event || '';
    const plan = body.plan || body.Plan || '';
    const repo = body.repo || body.repository || body.Repo || '';
    const task = body.task || body.Task || '';
    const snapshot = body.snapshot || body.snapshot_id || body.snapshotId || body.Snapshot || '';

    // Determine success/failure — very prominent
    const eventLower = event.toLowerCase();
    const isError = eventLower.includes('error') || eventLower.includes('fail');
    const isWarning = eventLower.includes('warning') || eventLower.includes('warn');
    const isSuccess = !isError && !isWarning;

    // Overview stats
    const overview = body.overview || body.Overview || {};
    const stats = body.stats || body.statistics || body.Statistics || body.backup_statistics || {};
    const dataAdded = overview.data_added || overview.dataAdded || body.data_added || '';
    const totalFiles = overview.total_files_processed || overview.totalFiles || body.total_files_processed || '';
    const totalBytes = overview.total_bytes_processed || overview.totalBytes || body.total_bytes_processed || '';
    const duration = stats.total_duration || stats.totalDuration || body.duration || body.total_duration || '';
    const filesNew = stats.files_new || stats.filesNew || '';
    const filesChanged = stats.files_changed || stats.filesChanged || '';

    // Status banner — big and obvious
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

    const planName = plan || (task ? task.match(/plan "([^"]+)"/)?.[1] : '') || 'unknown';

    const fields = [];
    if (planName) fields.push({ name: 'Plan', value: planName, inline: true });
    if (repo) fields.push({ name: 'Repository', value: repo, inline: true });
    if (event) fields.push({ name: 'Event', value: event, inline: true });
    if (dataAdded) fields.push({ name: 'Data Added', value: String(dataAdded), inline: true });
    if (totalFiles) fields.push({ name: 'Files Processed', value: String(totalFiles).replace(/\B(?=(\d{3})+(?!\d))/g, ','), inline: true });
    if (totalBytes) fields.push({ name: 'Total Size', value: String(totalBytes), inline: true });
    if (filesNew) fields.push({ name: 'New Files', value: String(filesNew).replace(/\B(?=(\d{3})+(?!\d))/g, ','), inline: true });
    if (filesChanged) fields.push({ name: 'Changed Files', value: String(filesChanged).replace(/\B(?=(\d{3})+(?!\d))/g, ','), inline: true });
    if (duration) fields.push({ name: 'Duration', value: String(duration), inline: true });
    if (snapshot) fields.push({ name: 'Snapshot', value: String(snapshot).substring(0, 16), inline: false });

    // Error/warning details
    const message = body.message || body.error || body.Message || '';

    const sourceIcon = config.sources?.backrest?.icon || '';

    return [{
      author: sourceIcon ? { name: 'Backrest', icon_url: sourceIcon } : undefined,
      title: `${statusIcon} ${statusText}: ${planName}`,
      description: message || undefined,
      color,
      fields,
      footer: { text: 'Backrest' },
      timestamp: new Date().toISOString(),
      route: isError ? 'critical' : isWarning ? 'warning' : 'backups'
    }];
  }
};
