'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { GeoIP, isPrivate, osmTile } = require('../src/geoip');
const { Metrics } = require('../src/metrics');
const { startFakeDiscord, startApp, waitDone } = require('./helpers');

const config = { discord: { critical: 'x', warning: 'x', daily: 'x', updates: 'x', media: 'x' }, sources: {}, geoip: { enabled: true, map: true, zoom: 10 }, channels: { '555': 'updates' } };
const TOKEN = 'test-token-0123456789';
const auth = { 'x-relay-token': TOKEN };

test('geoip: private addresses skipped, results cached, provider errors swallowed, rate limit honoured', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, json: async () => ({ status: 'success', country: 'United Kingdom', regionName: 'England', city: 'Slough', isp: 'DigitalOcean, LLC', org: 'DigitalOcean, LLC', as: 'AS14061 DigitalOcean, LLC', lat: 51.5177, lon: -0.6215 }) }; };
  const metrics = new Metrics();
  const g = new GeoIP({ fetchImpl, metrics, perMinute: 2 });
  assert.equal(await g.lookup('192.168.1.5'), null);
  assert.equal(await g.lookup('10.0.0.1'), null);
  const a = await g.lookup('161.35.46.74');
  assert.equal(a.city, 'Slough');
  const b = await g.lookup('161.35.46.74');
  assert.equal(b, a);
  assert.equal(calls, 1);
  await g.lookup('8.8.8.8');
  assert.equal(await g.lookup('1.1.1.1'), null, 'third distinct lookup inside a minute is rate limited');
  assert.equal(metrics.get('geoip_total', { outcome: 'rate_limited' }), 1);
  const bad = new GeoIP({ fetchImpl: async () => { throw new Error('boom'); } });
  assert.equal(await bad.lookup('9.9.9.9'), null);
  assert.ok(isPrivate('172.16.4.4') && !isPrivate('8.8.8.8'));
  assert.equal(osmTile(51.5177, -0.6215, 10), 'https://tile.openstreetmap.org/10/510/340.png');
});

test('crowdsec: Notifiarr-style sentence, Details code block with GeoIP, map tile, host in title', async () => {
  const p = require('../src/parsers/crowdsec');
  const geoip = { lookup: async ip => ip === '161.35.46.74' ? { country: 'United Kingdom', region: 'England', city: 'Slough', isp: 'DigitalOcean, LLC', org: 'DigitalOcean, LLC', as: 'AS14061 DigitalOcean, LLC', lat: 51.5177, lon: -0.6215 } : null };
  const body = [{ ip: '161.35.46.74', scenario: 'Ip/crowdsecurity/appsec-vpatch', action: 'ban', duration: '4h', scope: 'Ip', origin: 'crowdsec', events_count: 2,
    machine: 'secstack', start_at: '2026-04-05T05:40:00Z', stop_at: '2026-04-05T05:50:25Z', labels: { type: 'appsec-block', service: 'appsec' } }];
  const [e] = await p.parse(body, config, { services: { geoip } });
  assert.equal(e.title, 'Ban on secstack');
  assert.match(e.description, /^Ip `161\.35\.46\.74` performed `crowdsecurity\/appsec-vpatch` \(2 events over 625s\) at 2026-04-05T05:50:25Z$/);
  const names = e.fields.map(f => f.name);
  assert.deepEqual(names.slice(0, 5), ['Service', 'Log type', 'Scenario', 'Org', 'Events']);
  const details = e.fields.find(f => f.name === 'Details').value;
  assert.match(details, /abuseipdb\.com\/check\/161\.35\.46\.74/);
  assert.match(details, /Country: United Kingdom\nState: England\nCity: Slough\nISP: DigitalOcean, LLC\nASN: AS14061 DigitalOcean, LLC\nBan length: 4h\nFailures: 2/);
  assert.equal(e.image.url, 'https://tile.openstreetmap.org/10/510/340.png');
  assert.equal(e.route, 'warning');
});

test('crowdsec: no geoip service → still a complete embed, no map', async () => {
  const p = require('../src/parsers/crowdsec');
  const [e] = await p.parse([{ ip: '203.0.113.9', scenario: 'Ip/crowdsecurity/ssh-bf', action: 'ban', duration: '4h' }], config, {});
  assert.equal(e.title, 'Ban on 203.0.113.9');
  assert.equal(e.image, undefined);
  assert.match(e.fields.find(f => f.name === 'Details').value, /Ban length: 4h/);
});

test('uptimekuma: emoji badge in title, Status and Codes fields, routes by state', () => {
  const p = require('../src/parsers/uptimekuma');
  const mon = { name: 'bazarr', type: 'http', method: 'GET', timeout: 48, url: 'https://x', accepted_statuscodes: ['200-299'], maintenance: false };
  const [down] = p.parse({ monitor: mon, heartbeat: { status: 0, msg: 'Flip UP to DOWN' } }, config);
  assert.equal(down.title, '[bazarr] [🔴 Down] Flip UP to DOWN');
  assert.equal(down.route, 'critical');
  assert.ok(down.fields.some(f => f.name === 'Codes' && f.value === '200-299'));
  assert.ok(down.fields.some(f => f.name === 'Status' && f.value === '0'));
  const [up] = p.parse({ monitor: mon, heartbeat: { status: 1, msg: '200 - OK', ping: 12 } }, config);
  assert.equal(up.title, '[bazarr] [✅ Up] 200 - OK');
  assert.equal(up.route, 'daily');
  assert.ok(up.fields.some(f => f.name === 'Ping' && f.value === '12ms'));
});

test('diun: sentence description, tag field, hub link on repo title', () => {
  const p = require('../src/parsers/diun');
  const [e] = p.parse({ hostname: 'prod1', status: 'update', image: 'docker.io/library/postgres:16', hub_link: 'https://hub.docker.com/_/postgres', diun_version: '4.33.0' }, config);
  assert.equal(e.description, 'A new image is available for **docker.io/library/postgres:16** on **prod1**.');
  assert.equal(e.title, 'docker.io/library/postgres');
  assert.ok(e.fields.some(f => f.name === 'Tag' && f.value === '`16`'));
  assert.match(e.author.name, /^Update Available/);
  assert.match(e.footer.text, /DIUN 4\.33\.0/);
});

test('notifiarr passthrough: full schema → embed with author icon, fields, images, color, pings, channel map', () => {
  const p = require('../src/parsers/notifiarr');
  const body = { notification: { update: false, name: 'My App', event: '1' },
    discord: { color: '22C55E', ping: { pingUser: 123, pingRole: 456 }, images: { thumbnail: 'https://i/t.png', image: 'https://i/b.png' },
      text: { title: 'My Title', icon: 'https://i/icon.png', content: 'Heads up', description: 'Desc', fields: [{ title: 'F1', text: 'inline', inline: true }, { title: 'F2', text: 'block' }], footer: 'Foot' },
      ids: { channel: 555 } } };
  const out = p.parse(body, config, {});
  assert.equal(out.payloads[0].route, 'updates');
  const b = out.payloads[0].body;
  assert.equal(b.content, 'Heads up <@123> <@&456>');
  const e = b.embeds[0];
  assert.deepEqual(e.author, { name: 'My App', icon_url: 'https://i/icon.png' });
  assert.equal(e.title, 'My Title');
  assert.equal(e.color, 0x22C55E);
  assert.deepEqual(e.fields, [{ name: 'F1', value: 'inline', inline: true }, { name: 'F2', value: 'block', inline: false }]);
  assert.deepEqual(e.thumbnail, { url: 'https://i/t.png' });
  assert.deepEqual(e.image, { url: 'https://i/b.png' });
  assert.deepEqual(e.footer, { text: 'Foot' });
  assert.throws(() => p.parse({ notification: { name: 'x' }, discord: { text: {} } }, config, {}), /needs a title/);
  assert.equal(p.parse({ notification: { name: 'x' }, discord: { text: { title: 't' }, ids: { channel: 999 } } }, config, { query: { route: 'media' } }).payloads[0].route, 'media');
});

test('app: Notifiarr passthrough paths and raw forward to an extra consumer', async t => {
  const received = [];
  const sink = http.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { received.push(JSON.parse(b)); res.statusCode = 200; res.end('ok'); }); });
  await new Promise(r => sink.listen(0, '127.0.0.1', r));
  const sinkUrl = `http://127.0.0.1:${sink.address().port}/webhook`;
  const fake = await startFakeDiscord();
  const app = await startApp(fake, { sources: { diun: { route: 'updates', forward: [sinkUrl] } }, channels: {} });
  t.after(async () => { await app.close(); await fake.close(); await new Promise(r => sink.close(r)); });

  const r1 = await app.post(`/api/v1/notification/passthrough/${TOKEN}`, { notification: { name: 'Script' }, discord: { text: { title: 'Hello', description: 'from a notifiarr-style script' } } });
  assert.equal(r1.status, 202);
  const [d1] = await waitDone(app, 1);
  assert.equal(d1.source, 'notifiarr');
  assert.equal(d1.route, 'daily');
  assert.equal(fake.received.at(-1).body.embeds[0].author.name, 'Script');

  const r2 = await app.post('/api/v1/notification/passthrough', { notification: { name: 'S2' }, discord: { text: { title: 'T2' } } }, auth);
  assert.equal(r2.status, 202);
  await waitDone(app, 1);

  const diun = { hostname: 'prod1', status: 'update', image: 'ghcr.io/x/y:1' };
  const r3 = await app.post('/webhook/diun', diun, auth);
  assert.equal(r3.status, 202);
  await waitDone(app, 1);
  const deadline = Date.now() + 2000;
  while (!received.length && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(received[0], diun, 'raw DIUN payload forwarded unchanged');
  assert.equal(app.metrics.get('forward_total', { source: 'diun', outcome: 'ok' }), 1);
});
