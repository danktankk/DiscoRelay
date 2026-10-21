'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toPayloads } = require('../src/normalize');

const config = { discord: { critical: 'x', warning: 'x', daily: 'x', updates: 'x', media: 'x' }, sources: {} };

test('crowdsec: array of decisions → one warning embed per decision with IP link', () => {
  const p = require('../src/parsers/crowdsec');
  const body = [{ ip: '203.0.113.9', scenario: 'Ip/crowdsecurity/ssh-bf', action: 'ban', duration: '4h', scope: 'Ip', origin: 'crowdsec', events_count: 6,
    message: 'IP 203.0.113.9 triggered crowdsecurity/ssh-bf', source: { scope: 'Ip', value: '203.0.113.9', ip: '203.0.113.9', scenario: 'crowdsecurity/ssh-bf' }, labels: { type: 'Ip', service: 'crowdsec' } }];
  const embeds = p.parse(body, config);
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].route, 'warning');
  assert.match(embeds[0].title, /Ban on 203\.0\.113\.9/);
  assert.ok(embeds[0].fields.some(f => f.name === 'IP' && f.value.includes('abuseipdb.com/check/203.0.113.9')));
});

test('diun: update payload → updates route, host and digest shown', () => {
  const p = require('../src/parsers/diun');
  const embeds = p.parse({ diun_version: '4.33.0', hostname: 'prod1', status: 'update', provider: 'docker', image: 'docker.io/library/postgres:16',
    hub_link: 'https://hub.docker.com/_/postgres', digest: 'sha256:0123456789abcdef0123', created: '2026-10-20T10:11:12Z', platform: 'linux/amd64',
    metadata: { ctn_names: 'authelia-postgresql-1' } }, config);
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].route, 'updates');
  assert.equal(embeds[0].title, 'Update: docker.io/library/postgres:16');
  assert.equal(embeds[0].url, 'https://hub.docker.com/_/postgres');
  assert.ok(embeds[0].fields.some(f => f.name === 'Host' && f.value === '`prod1`'));
  assert.ok(embeds[0].fields.some(f => f.name === 'Digest' && f.value === '`0123456789ab`'));
  assert.ok(embeds[0].fields.some(f => f.name === 'Container' && f.value.includes('authelia-postgresql-1')));
});

test('diun: new image → blue, "New" title', () => {
  const p = require('../src/parsers/diun');
  const [e] = p.parse({ status: 'new', image: 'ghcr.io/x/y:1' }, config);
  assert.equal(e.title, 'New: ghcr.io/x/y:1');
  assert.equal(e.color, 0x3B82F6);
});

test('graylog: priority 3 → critical, backlog rendered as code block', () => {
  const p = require('../src/parsers/graylog');
  const [e] = p.parse({ event_definition_title: 'PVE2 down', event: { message: 'host unreachable', source: 'graylog', priority: 3, timestamp: '2026-10-21T12:00:00.000Z', key: 'pve2', fields: { host: 'pve2' } },
    backlog: [{ timestamp: '2026-10-21T12:00:00.000Z', source: 'pve2', message: 'icmp timeout' }] }, config);
  assert.equal(e.route, 'critical');
  assert.equal(e.title, 'PVE2 down');
  assert.ok(e.fields.some(f => f.name === 'Priority' && f.value === 'High'));
  assert.ok(e.fields.some(f => f.name.startsWith('Backlog') && f.value.includes('icmp timeout')));
});

test('graylog: priority 1 → daily, priority 2 → warning', () => {
  const p = require('../src/parsers/graylog');
  assert.equal(p.parse({ event: { priority: 1 } }, config)[0].route, 'daily');
  assert.equal(p.parse({ event: { priority: 2 } }, config)[0].route, 'warning');
});

test('generic: severity drives the route, explicit route wins when it exists', () => {
  const p = require('../src/parsers/generic');
  assert.equal(p.parse({ title: 'x', severity: 'critical' }, config)[0].route, 'critical');
  assert.equal(p.parse({ title: 'x', level: 'error' }, config)[0].route, 'warning');
  assert.equal(p.parse({ title: 'x' }, config)[0].route, 'daily');
  assert.equal(p.parse({ title: 'x', severity: 'critical', route: 'updates' }, config)[0].route, 'updates');
  assert.equal(p.parse({ title: 'x', severity: 'critical', route: 'nope' }, config)[0].route, 'critical');
});

test('generic: Slack-shaped {text} and plain strings are accepted; fields object becomes inline fields', () => {
  const p = require('../src/parsers/generic');
  const [slack] = p.parse({ text: 'Container autoheal restarted nginx' }, config, { query: { source: 'autoheal' } });
  assert.equal(slack.description, 'Container autoheal restarted nginx');
  assert.equal(slack.author.name, 'autoheal');
  const [plain] = p.parse('disk 91% on pve1', config);
  assert.equal(plain.description, 'disk 91% on pve1');
  const [withFields] = p.parse({ title: 't', fields: { Disk: '91%', Mount: '/' } }, config);
  assert.ok(withFields.fields.some(f => f.name === 'Disk' && f.value === '91%'));
});

test('generic: rejects arrays and non-objects', () => {
  const p = require('../src/parsers/generic');
  assert.throws(() => p.parse([1, 2], config));
  assert.throws(() => p.parse(42, config));
});

test('discord passthrough: forwards content/embeds/username to the route from the query string', () => {
  const p = require('../src/parsers/discord');
  const out = p.parse({ content: 'hello', embeds: [{ title: 'e' }], username: 'shrike', avatar_url: 'https://x/y.png', unknown: 1 }, config, { query: { route: 'updates' } });
  assert.deepEqual(out.payloads[0], { route: 'updates', body: { content: 'hello', embeds: [{ title: 'e' }], username: 'shrike', avatar_url: 'https://x/y.png' } });
});

test('discord passthrough: rejects empty payloads, >10 embeds and unknown routes', () => {
  const p = require('../src/parsers/discord');
  assert.throws(() => p.parse({}, config), /neither content nor embeds/);
  assert.throws(() => p.parse({ embeds: Array.from({ length: 11 }, () => ({ title: 'x' })) }, config), /at most 10/);
  assert.throws(() => p.parse({ content: 'x' }, config, { query: { route: 'nope' } }), /unknown route/);
});

test('normalize: embeds are grouped by route and chunked at 10 per message', () => {
  const embeds = [];
  for (let i = 0; i < 12; i++) embeds.push({ title: `a${i}`, route: 'daily' });
  embeds.push({ title: 'w', route: 'warning' });
  embeds.push({ title: 'd-again', route: 'daily' });
  const payloads = toPayloads(embeds, 'daily');
  assert.deepEqual(payloads.map(p => [p.route, p.body.embeds.length]), [['daily', 10], ['daily', 2], ['warning', 1], ['daily', 1]]);
  assert.equal(payloads[0].body.embeds[0].route, undefined);
});

test('normalize: empty strings, nulls and empty objects are stripped', () => {
  const [p] = toPayloads([{ title: 't', description: '', thumbnail: {}, footer: { text: null }, fields: [{ name: 'a', value: 'b', inline: true }] }], 'daily');
  assert.deepEqual(p.body.embeds[0], { title: 't', fields: [{ name: 'a', value: 'b', inline: true }] });
});
