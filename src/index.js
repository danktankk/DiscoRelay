const express = require('express');
const fs = require('fs');
const path = require('path');
const { sendEmbed } = require('./discord');

// Load config
const configPath = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config.json');
if (!fs.existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  console.error('Copy config.example.json to config.json and fill in your webhook URLs.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Load parsers
const parsers = {};
const parserDir = path.join(__dirname, 'parsers');
for (const file of fs.readdirSync(parserDir)) {
  if (file.endsWith('.js')) {
    parsers[file.replace('.js', '')] = require(path.join(parserDir, file));
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', sources: Object.keys(parsers) }));

// Webhook endpoints
for (const [source, parser] of Object.entries(parsers)) {
  app.post(`/webhook/${source}`, async (req, res) => {
    const body = req.body;
    console.log(`[${source}] Received webhook`);

    try {
      const sourceConfig = config.sources?.[source] || {};
      const results = parser(body, sourceConfig);

      for (const result of results) {
        const webhookUrl = config.discord?.[result.route];
        if (!webhookUrl || webhookUrl === 'PASTE_YOUR_WEBHOOK_HERE') {
          console.warn(`[${source}] No webhook configured for route: ${result.route}`);
          continue;
        }
        await sendEmbed(webhookUrl, result.embed);
        console.log(`[${source}] Sent to ${result.route}: ${result.embed.title}`);
      }

      res.status(200).json({ ok: true, sent: results.length });
    } catch (err) {
      console.error(`[${source}] Error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// Catch-all for unknown sources
app.post('/webhook/:source', (req, res) => {
  console.warn(`[unknown] No parser for source: ${req.params.source}`);
  res.status(404).json({ error: `Unknown source: ${req.params.source}` });
});

const port = config.port || 3080;
app.listen(port, '0.0.0.0', () => {
  console.log(`DiscoRelay listening on :${port}`);
  console.log(`Sources: ${Object.keys(parsers).join(', ')}`);
});
