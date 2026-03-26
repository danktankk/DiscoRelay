const https = require('https');
const http = require('http');
const { URL } = require('url');

function colorToInt(hex) {
  if (typeof hex === 'number') return hex;
  return parseInt(hex.replace('#', ''), 16);
}

async function sendEmbed(webhookUrl, { title, description, color, thumbnail, fields, footer, timestamp }) {
  const embed = {
    title: title?.slice(0, 256),
    description: description?.slice(0, 4096),
    color: colorToInt(color || '#3B82F6'),
    timestamp: timestamp || new Date().toISOString(),
  };
  if (thumbnail) embed.thumbnail = { url: thumbnail };
  if (fields?.length) embed.fields = fields.slice(0, 25).map(f => ({
    name: String(f.name).slice(0, 256),
    value: String(f.value).slice(0, 1024),
    inline: f.inline ?? false,
  }));
  if (footer) embed.footer = { text: String(footer).slice(0, 2048) };

  const body = JSON.stringify({ embeds: [embed] });
  const url = new URL(webhookUrl);
  const mod = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 429) {
          const retry = JSON.parse(data).retry_after || 1;
          console.log(`[discord] Rate limited, retrying in ${retry}s`);
          setTimeout(() => sendEmbed(webhookUrl, { title, description, color, thumbnail, fields, footer, timestamp }).then(resolve).catch(reject), retry * 1000);
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Discord ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

module.exports = { sendEmbed };
