module.exports = function parse(body, sourceConfig) {
  // Backrest webhook payloads vary; common: type/event, repo, plan, status, snapshot_id, error
  const event = body.type || body.event || 'unknown';
  const repo = body.repo || body.repo_id || '';
  const plan = body.plan || body.plan_id || '';
  const error = body.error || body.message || '';
  const snapshotId = body.snapshot_id || '';

  const isError = event.includes('error') || event.includes('fail') || !!error;
  const isSuccess = !isError;

  let icon, desc;
  if (isError) {
    icon = '❌';
    desc = `Backup failed`;
    if (plan) desc += ` — plan **${plan}**`;
    if (repo) desc += ` (repo: ${repo})`;
  } else {
    icon = '✅';
    desc = `Backup completed`;
    if (plan) desc += ` — plan **${plan}**`;
    if (repo) desc += ` (repo: ${repo})`;
  }

  const fields = [];
  if (snapshotId) fields.push({ name: 'Snapshot', value: `\`${snapshotId}\``, inline: true });
  if (error) fields.push({ name: 'Error', value: error.slice(0, 1024) });

  return [{
    route: isError ? 'critical' : 'daily',
    embed: {
      title: `${icon} ${desc}`,
      description: error && isError ? error.slice(0, 500) : undefined,
      color: isError ? '#DC2626' : (sourceConfig.color || '#4A90D9'),
      thumbnail: sourceConfig.icon,
      fields: fields.length ? fields : undefined,
      footer: 'Backrest',
    },
  }];
};
