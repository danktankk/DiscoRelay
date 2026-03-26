const express = require('express');
const fs = require('fs');
const path = require('path');
const DiscordSender = require('./discord');

const configPath = process.env.CONFIG_PATH || path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const discord = new DiscordSender(config);
const app = express();
app.use(express.json({ limit: '10mb' }));

// Auto-load parsers
const parsers = {};
const parserDir = path.join(__dirname, 'parsers');
for (const file of fs.readdirSync(parserDir)) {
  if (file.endsWith('.js')) {
    const name = file.replace('.js', '');
    parsers[name] = require(path.join(parserDir, file));
    console.log(`Loaded parser: ${name}`);
  }
}

// Webhook endpoints
app.post('/webhook/:source', async (req, res) => {
  const source = req.params.source;
  const parser = parsers[source];
  if (!parser) return res.status(404).json({ error: `Unknown source: ${source}` });
  
  try {
    const embeds = parser.parse(req.body, config);
    const defaultRoute = config.sources?.[source]?.route || 'daily';
    await discord.send(embeds, defaultRoute);
    res.json({ ok: true, sent: embeds.length });
  } catch (err) {
    console.error(`Error processing ${source}:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sources: Object.keys(parsers) });
});

const port = config.port || 3080;
app.listen(port, () => console.log(`DiscoRelay listening on port ${port}`));
