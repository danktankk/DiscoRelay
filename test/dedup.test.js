'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Dedup, fingerprint } = require('../src/dedup');

test('fingerprint ignores timestamp and footer, cares about everything else', () => {
  const a = fingerprint('s', { embeds: [{ title: 'x', timestamp: '2026-01-01T00:00:00Z', footer: { text: '1' } }] });
  const b = fingerprint('s', { embeds: [{ title: 'x', timestamp: '2026-01-02T00:00:00Z', footer: { text: '2' } }] });
  const c = fingerprint('s', { embeds: [{ title: 'y' }] });
  const d = fingerprint('other', { embeds: [{ title: 'x' }] });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
});

test('same fingerprint inside the window is suppressed, after the window it passes again (fixed window)', () => {
  let t = 1_000_000;
  const dd = new Dedup({ windowSec: 60, now: () => t });
  assert.equal(dd.check('s', 'fp').suppressed, false);
  t += 10_000;
  assert.deepEqual(dd.check('s', 'fp').suppressed, true);
  t += 30_000; // 40s after first: still inside, and the window did not slide
  assert.equal(dd.check('s', 'fp').suppressed, true);
  t += 25_000; // 65s after first
  assert.equal(dd.check('s', 'fp').suppressed, false);
});

test('window 0 disables dedup; per-source override is honoured', () => {
  const dd = new Dedup({ windowSec: 300 });
  assert.equal(dd.check('s', 'fp', 0).suppressed, false);
  assert.equal(dd.check('s', 'fp', 0).suppressed, false);
  assert.equal(dd.windowFor({ sources: { radarr: { dedup_window_sec: 0 } } }, 'radarr'), 0);
  assert.equal(dd.windowFor({ sources: {} }, 'radarr'), 300);
});

test('map is bounded by maxEntries', () => {
  const dd = new Dedup({ windowSec: 300, maxEntries: 10 });
  for (let i = 0; i < 50; i++) dd.check('s', 'fp' + i);
  assert.ok(dd.seen.size <= 10);
});
