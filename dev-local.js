// Local, secret-free launcher for the setup page: fake webhooks (pattern-valid, deliveries fail harmlessly),
// no database, example config. `node dev-local.js` then open http://127.0.0.1:3081/admin with token below.
process.env.PORT = process.env.PORT || '3081';
process.env.RELAY_TOKEN = process.env.RELAY_TOKEN || 'local-dev-token-0123456789';
process.env.CONFIG_PATH = require('path').join(__dirname, 'config.example.json');
for (const r of ['CRITICAL', 'WARNING', 'DAILY', 'MEDIA', 'BACKUPS', 'UPDATES']) {
  process.env[`DISCORD_WEBHOOK_${r}`] = process.env[`DISCORD_WEBHOOK_${r}`] || `https://discord.com/api/webhooks/1000000000000000000/local-dev-${r.toLowerCase()}-not-a-real-token`;
}
delete process.env.DATABASE_URL;
require('./src/index').main();
