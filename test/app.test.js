'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startFakeDiscord, startApp, waitDone } = require('./helpers');

const TOKEN = 'test-token-0123456789';
const auth = { 'x-relay-token': TOKEN };

test('webhook ingest: auth, routing, delivery, metrics, health', async t => {
  const fake = await startFakeDiscord();
  const app = await startApp(fake);
  t.after(async () => { await app.close(); await fake.close(); });

  await t.test('rejects without a token (header, bearer and ?token= all accepted)', async () => {
    const r = await app.post('/webhook/generic', { title: 'x' });
    assert.equal(r.status, 401);
    assert.equal((await app.post('/webhook/generic', { title: 'x' }, { authorization: `Bearer ${TOKEN}` })).status, 202);
    assert.equal((await app.post(`/webhook/generic?token=${TOKEN}`, { title: 'x2' })).status, 202);
    await waitDone(app, 2);
  });

  await t.test('scoped token works only for its source', async () => {
    const scoped = { 'x-relay-token': 'crowdsec-only-token-1' };
    assert.equal((await app.post('/webhook/generic', { title: 'y' }, scoped)).status, 401);
    const r = await app.post('/webhook/crowdsec', [{ ip: '198.51.100.1', scenario: 'a/b', action: 'ban' }], scoped);
    assert.equal(r.status, 202);
    const [done] = await waitDone(app, 1);
    assert.equal(done.status, 'sent');
    assert.equal(done.route, 'warning');
  });

  await t.test('unknown source → 404, bad JSON → 400, parse error → 400', async () => {
    assert.equal((await app.post('/webhook/nope', { a: 1 }, auth)).status, 404);
    assert.equal((await app.post('/webhook/generic', '{not json', auth)).status, 400);
    assert.equal((await app.post('/webhook/discord', {}, auth)).status, 400);
  });

  await t.test('payload reaches the right webhook with Notifiarr-style embed', async () => {
    const before = fake.received.length;
    const r = await app.post('/webhook/generic', { title: 'Disk full', message: 'pve1 /var 97%', severity: 'critical', host: 'pve1' }, auth);
    assert.equal(r.status, 202);
    const body = await r.json();
    assert.equal(body.queued, 1);
    const [done] = await waitDone(app, 1);
    assert.equal(done.status, 'sent');
    const hit = fake.received[before];
    assert.match(hit.path, /critical-token$/);
    assert.equal(hit.body.embeds[0].title, 'Disk full');
    assert.ok(hit.body.embeds[0].fields.some(f => f.name === 'Host' && f.value === '`pve1`'));
  });

  await t.test('passthrough forwards a native Discord payload to ?route=', async () => {
    const before = fake.received.length;
    const r = await app.post('/webhook/discord?route=updates', { content: 'shrike found a release', username: 'shrike' }, auth);
    assert.equal(r.status, 202);
    await waitDone(app, 1);
    const hit = fake.received[before];
    assert.match(hit.path, /updates-token$/);
    assert.deepEqual(hit.body, { content: 'shrike found a release', username: 'shrike' });
  });

  await t.test('duplicate inside the dedup window is suppressed, distinct payload is not', async () => {
    const r1 = await app.post('/webhook/generic', { title: 'repeat', message: 'same' }, auth);
    assert.equal((await r1.json()).queued, 1);
    await waitDone(app, 1);
    const r2 = await app.post('/webhook/generic', { title: 'repeat', message: 'same' }, auth);
    const j2 = await r2.json();
    assert.equal(r2.status, 200);
    assert.deepEqual([j2.queued, j2.suppressed], [0, 1]);
    const r3 = await app.post('/webhook/generic', { title: 'repeat', message: 'different' }, auth);
    assert.equal((await r3.json()).queued, 1);
    await waitDone(app, 1);
    assert.equal(app.metrics.get('suppressed_total', { source: 'generic' }), 1);
  });

  await t.test('source with dedup_window_sec 0 is never suppressed', async () => {
    const movie = { eventType: 'Grab', movie: { title: 'Heat', year: 1995 } };
    assert.equal((await (await app.post('/webhook/radarr', movie, auth)).json()).queued, 1);
    assert.equal((await (await app.post('/webhook/radarr', movie, auth)).json()).queued, 1);
    await waitDone(app, 2);
  });

  await t.test('health is public, metrics need a token and render Prometheus text', async () => {
    const h = await (await app.get('/health')).json();
    assert.equal(h.status, 'ok');
    assert.ok(h.sources.includes('diun') && h.sources.includes('discord') && h.sources.includes('generic'));
    assert.equal(h.auth, true);
    assert.equal((await app.get('/metrics')).status, 401);
    const m = await app.get('/metrics', auth);
    assert.equal(m.status, 200);
    const text = await m.text();
    assert.match(text, /discorelay_sent_total\{route="critical"\} \d+/);
    assert.match(text, /discorelay_rejected_total\{reason="auth"\} \d+/);
    assert.match(text, /# TYPE discorelay_queue_depth gauge/);
  });

  await t.test('admin test endpoint posts a test embed to a route', async () => {
    const before = fake.received.length;
    assert.equal((await app.post('/api/test/backups', {}, auth)).status, 202);
    assert.equal((await app.post('/api/test/nope', {}, auth)).status, 404);
    await waitDone(app, 1);
    assert.match(fake.received[before].path, /backups-token$/);
    assert.match(fake.received[before].body.embeds[0].title, /Test notification/);
  });

  await t.test('history endpoint reports disabled without a database', async () => {
    assert.equal((await app.get('/api/history', auth)).status, 501);
    assert.equal((await app.get('/api/history')).status, 401);
  });
});

test('delivery: 429 is honoured and retried, 5xx retries then fails, 4xx fails fast, timeout retries', async t => {
  const fake = await startFakeDiscord();
  const app = await startApp(fake);
  t.after(async () => { await app.close(); await fake.close(); });

  await t.test('429 with retry_after (seconds) → wait, retry, sent; attempt budget untouched', async () => {
    fake.responses.push({ status: 429, body: JSON.stringify({ retry_after: 0.01 }) }, { status: 204 });
    const before = fake.received.length;
    await app.post('/webhook/generic', { title: 'rl' }, auth);
    const [done] = await waitDone(app, 1);
    assert.equal(done.status, 'sent');
    assert.equal(done.attempts, 1);
    assert.equal(fake.received.length - before, 2);
  });

  await t.test('persistent 5xx → failed after max_attempts', async () => {
    fake.responses.push({ status: 502 }, { status: 503 }, { status: 500 });
    const before = fake.received.length;
    await app.post('/webhook/generic', { title: 'down' }, auth);
    const [done] = await waitDone(app, 1);
    assert.equal(done.status, 'failed');
    assert.equal(done.attempts, 3);
    assert.equal(fake.received.length - before, 3);
    assert.equal(app.metrics.get('failed_total', { route: 'daily', reason: 'delivery' }), 1);
  });

  await t.test('400 from Discord is permanent: one attempt only', async () => {
    fake.responses.push({ status: 400, body: '{"message":"Invalid Form Body"}' });
    await app.post('/webhook/generic', { title: 'bad' }, auth);
    const [done] = await waitDone(app, 1);
    assert.equal(done.status, 'failed');
    assert.equal(done.attempts, 1);
    assert.match(done.error, /HTTP 400/);
  });

  await t.test('a hung connection times out and is retried', async () => {
    fake.responses.push({ hang: true }, { status: 204 });
    await app.post('/webhook/generic', { title: 'slow' }, auth);
    const [done] = await waitDone(app, 1, 5000);
    assert.equal(done.status, 'sent');
    assert.equal(done.attempts, 2);
  });

  await t.test('one failing route does not block another route', async () => {
    fake.responses.push({ status: 500 }, { status: 500 }, { status: 500 });
    await app.post('/webhook/generic', { title: 'daily-fails' }, auth);
    await app.post('/webhook/generic', { title: 'crit-ok', severity: 'critical' }, auth);
    const results = await waitDone(app, 2);
    const crit = results.find(r => r.route === 'critical');
    assert.equal(crit.status, 'sent');
  });
});

test('config: env overrides, token rules and webhook validation', () => {
  const { loadConfig } = require('../src/config');
  const path = require('path');
  const example = path.join(__dirname, '..', 'config.example.json');
  const env = { RELAY_TOKEN: 'abcdefghijklmnopqrstuvwxyz', DISCORD_WEBHOOK_CRITICAL: 'https://discord.com/api/webhooks/REDACTED/REDACTED', RELAY_TOKENS: 'anotherlongtoken123456:crowdsec|backrest' };
  const cfg = loadConfig(example, env);
  assert.deepEqual(cfg.discord, { critical: 'https://discord.com/api/webhooks/REDACTED/REDACTED' });
  assert.deepEqual(cfg.auth.tokens, { abcdefghijklmnopqrstuvwxyz: ['*'], anotherlongtoken123456: ['crowdsec', 'backrest'] });
  assert.equal(cfg.port, 3080);
  assert.throws(() => loadConfig(example, {}), /no tokens/);
  assert.throws(() => loadConfig(example, { RELAY_TOKEN: 'short' }), /at least 16/);
  assert.throws(() => loadConfig(example, { RELAY_TOKEN: 'abcdefghijklmnopqrstuvwxyz', DISCORD_WEBHOOK_DAILY: 'http://evil/x' }), /not a Discord webhook/);
  assert.equal(loadConfig(example, { RELAY_AUTH_REQUIRED: 'false' }).auth.required, false);
});
