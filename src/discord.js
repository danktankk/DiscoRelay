const https = require('https');
const http = require('http');

class DiscordSender {
  constructor(config) {
    this.webhooks = config.discord || {};
  }

  async send(embeds, defaultRoute) {
    for (const embed of embeds) {
      const route = embed.route || defaultRoute || 'daily';
      delete embed.route;
      
      const webhookUrl = this.webhooks[route];
      if (!webhookUrl) {
        console.error(`No webhook for route: ${route}`);
        continue;
      }
      
      const payload = JSON.stringify({ embeds: [embed] });
      await this._post(webhookUrl, payload);
    }
  }

  _post(url, payload) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;
      
      const req = lib.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          if (res.statusCode === 429) {
            const retry = JSON.parse(body).retry_after || 1000;
            console.log(`Rate limited, retrying in ${retry}ms`);
            setTimeout(() => this._post(url, payload).then(resolve).catch(reject), retry);
          } else if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            console.error(`Discord error ${res.statusCode}: ${body}`);
            resolve();
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

module.exports = DiscordSender;
