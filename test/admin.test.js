'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startFakeDiscord, startApp, waitDone } = require('./helpers');
const { Settings, validateSource } = require('../src/settings');
const { NullStore } = require('../src/store');
const { maskWebhook } = require('../src/admin');

const TOKEN = 'test-token-0123456789';
const auth = { 'x-relay-token': TOKEN };
const bearer = { authorization: `Bearer ${TOKEN}` };

test('admin page is served, API needs the admin scope, overview lists sources and routes', async t => {
  const fake = await startFakeDiscord();
  const app = await startApp(fake);
  t.after(async () => { await app.close(); await fake.close(); });

  const page = await app.get('/admin');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>DiscoRelay<\/title>/);
  assert.equal((await app.get('/admin/app.js')).status, 200);
  assert.match((await app.get('/')).url, /\/admin$/, 'root redirects to the setup page');
  assert.equal((await app.get('/api/admin/overview')).status, 401);
  assert.equal((await app.get('/api/admin/overview', { 'x-relay-token': 'crowdsec-only-token-1' })).status, 401);
  const o = await (await app.get('/api/admin/overview', bearer)).json();
  assert.equal(o.version, 'test');
  assert.ok(o.sources.some(s => s.name === 'radarr' && s.events.includes('Grab') && s.route === 'auto'), 'radarr listed with its events; no route pinned in the fixture → auto');
  assert.ok(o.routes.some(r => r.name === 'critical' && /…\/webhooks\/1234567890\//.test(r.masked)));
  assert.equal(o.persisted, false);
  assert.equal(maskWebhook('https://discord.com/api/webhooks/123/abcdefghijklmnop'), '…/webhooks/123/abcd…mnop');
});

test('admin: saving a source override applies live (event routing, dedup), reset reverts to config.json', async t => {
  const fake = await startFakeDiscord();
  const app = await startApp(fake);
  t.after(async () => { await app.close(); await fake.close(); });
  const grab = { eventType: 'Grab', movie: { title: 'Heat', year: 1995, tmdbId: 949 }, release: { quality: 'Bluray-1080p' } };

  let r = await app.send('PUT', '/api/admin/sources/radarr', { events: { Grab: 'updates', Health: 'off', Download: '' }, dedup_window_sec: 0, forward: '' }, bearer);
  assert.equal(r.status, 200);
  const view = await r.json();
  assert.deepEqual(view.event_routes, { Grab: 'updates', Health: 'off' });
  assert.equal(view.overridden, true);
  assert.equal(app.config.sources.radarr.events.Grab, 'updates');

  const before = fake.received.length;
  await app.post('/webhook/radarr', grab, auth);
  const [done] = await waitDone(app, 1);
  assert.equal(done.route, 'updates');
  assert.match(fake.received[before].path, /updates-token$/);

  assert.equal((await app.send('PUT', '/api/admin/sources/radarr', { events: { Grab: 'nope' } }, bearer)).status, 400);
  assert.equal((await app.send('PUT', '/api/admin/sources/radarr', { route: 'nowhere' }, bearer)).status, 400);
  assert.equal((await app.send('PUT', '/api/admin/sources/radarr', { forward: 'ftp://x' }, bearer)).status, 400);
  assert.equal((await app.send('PUT', '/api/admin/sources/nope', { route: 'daily' }, bearer)).status, 404);

  r = await app.send('DELETE', '/api/admin/sources/radarr', undefined, bearer);
  assert.equal((await r.json()).overridden, false);
  assert.equal(app.config.sources.radarr.events, undefined);
  await app.post('/webhook/radarr', { ...grab, movie: { title: 'Heat 2' } }, auth);
  const [done2] = await waitDone(app, 1);
  assert.equal(done2.route, 'media');
});

test('admin: channel webhook override, validation, test send, new channel becomes routable', async t => {
  const fake = await startFakeDiscord();
  const app = await startApp(fake);
  t.after(async () => { await app.close(); await fake.close(); });

  assert.equal((await app.send('PUT', '/api/admin/routes/daily', { webhook: 'http://evil/x' }, bearer)).status, 400);
  assert.equal((await app.send('PUT', '/api/admin/routes/Bad Name', { webhook: fake.webhook('x') }, bearer)).status, 400);
  const r = await app.send('PUT', '/api/admin/routes/daily', { webhook: fake.webhook('rotated') }, bearer);
  assert.equal(r.status, 200);
  assert.equal(app.config.sources === app.settings.config.sources, true);
  const before = fake.received.length;
  await app.post('/webhook/generic', { title: 'after rotation' }, auth);
  await waitDone(app, 1);
  assert.match(fake.received[before].path, /rotated-token$/, 'sender picked up the rotated webhook live');

  assert.equal((await app.send('PUT', '/api/admin/routes/lab', { webhook: fake.webhook('lab') }, bearer)).status, 200);
  const before2 = fake.received.length;
  assert.equal((await app.send('POST', '/api/admin/routes/lab/test', undefined, bearer)).status, 202);
  await waitDone(app, 1);
  assert.match(fake.received[before2].path, /lab-token$/);
  assert.equal((await app.send('POST', '/api/admin/routes/ghost/test', undefined, bearer)).status, 404);

  await app.send('DELETE', '/api/admin/routes/daily', undefined, bearer);
  assert.match(app.config.discord.daily, /daily-token$/);
  const list = await (await app.get('/api/admin/routes', bearer)).json();
  assert.ok(list.some(x => x.name === 'lab' && x.overridden));
});

test('admin: settings (dedup window, geoip, enrich keys) apply live and are masked; preview renders without sending; senders carry the hub URL', async t => {
  const fake = await startFakeDiscord();
  const app = await startApp(fake);
  t.after(async () => { await app.close(); await fake.close(); });

  assert.equal((await app.send('PUT', '/api/admin/settings', { dedup: { window_sec: -1 } }, bearer)).status, 400);
  const r = await app.send('PUT', '/api/admin/settings', { dedup: { window_sec: 42 }, geoip: { enabled: false, zoom: 8 }, enrich: { github: false, tmdb_api_key: 'tmdbsecretkey' } }, bearer);
  assert.equal(r.status, 200);
  assert.equal(app.dedup.windowSec, 42);
  assert.equal(app.config.geoip.enabled, false);
  const s = await (await app.get('/api/admin/settings', bearer)).json();
  assert.equal(s.dedup.window_sec, 42);
  assert.equal(s.enrich.tmdb, true);
  assert.equal(s.enrich.tmdb_api_key, 'tmd…ey');
  assert.equal(s.enrich.github, false);

  const before = fake.received.length;
  const pv = await (await app.send('POST', '/api/admin/preview', { source: 'radarr', body: { eventType: 'Grab', movie: { title: 'Heat', year: 1995 }, release: { quality: 'Bluray-1080p' } } }, bearer)).json();
  assert.equal(pv.payloads.length, 1);
  assert.equal(pv.payloads[0].route, 'media');
  assert.equal(pv.payloads[0].body.embeds[0].title, 'Heat (1995)');
  assert.equal(pv.payloads[0].body.embeds[0].event, undefined);
  assert.equal(fake.received.length, before, 'preview never posts to Discord');
  assert.equal((await app.send('POST', '/api/admin/preview', { source: 'nope', body: {} }, bearer)).status, 404);
  assert.equal((await app.send('POST', '/api/admin/preview', { source: 'discord', body: {} }, bearer)).status, 400);

  const senders = await (await app.get('/api/admin/senders', bearer)).json();
  assert.match(senders.hub, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.ok(senders.snippets.some(x => x.key === 'radarr' && x.url.includes('{HUB}/webhook/radarr?token={TOKEN}')));
  const h = await (await app.get('/api/admin/history', bearer)).json();
  assert.deepEqual(h, { enabled: false, rows: [] });
  assert.equal((await app.get('/api/admin/history/1', bearer)).status, 501);
});

test('settings layer: validation and apply/revert against a config object without a database', async () => {
  const config = { discord: { daily: 'https://discord.com/api/webhooks/1/a' }, sources: { radarr: { route: 'media', icon: 'x' } }, dedup: { window_sec: 300 }, geoip: { enabled: true }, enrich: { github: true } };
  assert.throws(() => validateSource({ route: 'zzz' }, config), /unknown route/);
  assert.throws(() => validateSource({ dedup_window_sec: 'abc' }, config), /dedup_window_sec/);
  assert.throws(() => validateSource({ events: { 'bad name': 'daily' } }, config), /bad event name/);
  assert.deepEqual(validateSource({ events: { Grab: 'daily', Health: 'default', X: null }, forward: 'http://a\nhttps://b', icon: '' }, config), { events: { Grab: 'daily' }, forward: ['http://a', 'https://b'], icon: '' });
  const s = await new Settings({ config, store: new NullStore(), dedup: { windowSec: 300 } }).load();
  await s.set('sources.radarr', { route: 'daily', events: { Grab: 'off' } });
  assert.deepEqual(config.sources.radarr, { route: 'daily', icon: 'x', events: { Grab: 'off' } });
  await s.set('discord.lab', 'https://discord.com/api/webhooks/2/b');
  assert.equal(config.discord.lab, 'https://discord.com/api/webhooks/2/b');
  await s.unset('discord.lab');
  assert.equal(config.discord.lab, undefined);
  await s.unset('sources.radarr');
  assert.deepEqual(config.sources.radarr, { route: 'media', icon: 'x' });
  await s.set('dedup', { window_sec: 7 });
  assert.equal(s.dedup.windowSec, 7);
  await s.unset('dedup');
  assert.equal(s.dedup.windowSec, 300);
});
