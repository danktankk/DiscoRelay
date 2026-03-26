module.exports = {
  name: 'Backrest',
  parse(body, config) {
    const event = body.event || body.type || 'unknown';
    const success = !event.toLowerCase().includes('error') && !event.toLowerCase().includes('fail');
    const repo = body.repo || body.repository || '';
    const plan = body.plan || '';
    const snapshot = body.snapshot_id || body.snapshotId || '';
    const summary = body.summary || body.message || '';
    const stats = body.stats || {};
    
    const fields = [];
    if (repo) fields.push({ name: 'Repository', value: repo, inline: true });
    if (plan) fields.push({ name: 'Plan', value: plan, inline: true });
    if (snapshot) fields.push({ name: 'Snapshot', value: snapshot.substring(0, 12), inline: true });
    if (stats.totalSize) fields.push({ name: 'Size', value: `${(stats.totalSize / 1073741824).toFixed(1)} GB`, inline: true });
    if (stats.totalFiles) fields.push({ name: 'Files', value: String(stats.totalFiles), inline: true });
    
    return [{
      title: `${success ? '✅' : '❌'} Backup ${success ? 'Complete' : 'FAILED'}${plan ? ': ' + plan : ''}`,
      description: summary || undefined,
      color: parseInt(success ? '#22C55E' : '#DC2626', 16),
      fields,
      author: config.sources?.backrest?.icon ? { name: 'Backrest', icon_url: config.sources.backrest.icon } : undefined,
      footer: { text: 'Backrest' },
      timestamp: new Date().toISOString(),
      route: success ? 'daily' : 'critical'
    }];
  }
};
