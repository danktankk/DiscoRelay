'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startFakeDiscord, startApp, waitDone, quietLog } = require('./helpers');
const { Enricher, parseReleaseNotes } = require('../src/enrich');
const arr = require('../src/arr');
const { Metrics } = require('../src/metrics');

const config = { discord: { critical: 'x', warning: 'x', daily: 'x', updates: 'x', media: 'x' }, sources: { radarr: { icon: 'https://i/radarr.png' } } };
const field = (e, name) => (e.fields || []).find(f => f.name === name);

const stubEnrich = {
  async movie() { return { runtime: 103, certification: 'PG', tagline: 'On the air. Unaware.', studio: 'Paramount', awards: 'Nominated for 3 Oscars. 41 wins & 69 nominations total', ratings: { tmdb: '8.1', imdb: '8.2/10', rt: '95%', metacritic: '90' } }; },
  async series() { return { network: 'Apple TV+', certification: 'TV-MA', ratings: { tmdb: '8.6', imdb: '8.7/10' } }; },
  async release(app, version) { return { url: `https://github.com/${app}/releases/tag/v${version}`, new: ['Show size in history details', 'Option to treat downloads with non-media extensions as failed'], fixed: ['Deleting movie folder fails when files are not instantly removed'], other: [] }; },
};

const truman = {
  eventType: 'Grab', instanceName: 'Radarr',
  movie: { id: 1, title: 'The Truman Show', year: 1998, tmdbId: 37165, imdbId: 'tt0120382', overview: 'Every second of every day…', genres: ['Comedy', 'Drama'],
    images: [{ coverType: 'poster', remoteUrl: 'https://img/poster.jpg' }, { coverType: 'fanart', remoteUrl: 'https://img/fanart.jpg' }], originalLanguage: { id: 1, name: 'English' } },
  remoteMovie: { tmdbId: 37165, imdbId: 'tt0120382', title: 'The Truman Show', year: 1998 },
  release: { quality: 'Bluray-1080p', releaseGroup: 'FraMeSToR', releaseTitle: 'The.Truman.Show.1998.1080p.BluRay.x264-FraMeSToR', indexer: 'DrunkenSlug (Prowlarr)', size: 9331000000, languages: [{ id: 1, name: 'English' }] },
  downloadClient: 'sab', customFormatInfo: { customFormats: [{ id: 5, name: 'HD Bluray Tier 03' }, { id: 9, name: 'x264' }], customFormatScore: 1700 },
};

test('arr helpers: runtime, ratings line, release notes parser', () => {
  assert.equal(arr.fmtRuntime(103), '1h 43m');
  assert.equal(arr.fmtRuntime(45), '45m');
  assert.equal(arr.fmtRuntime(120), '2h');
  assert.equal(arr.fmtRuntime(0), '');
  assert.equal(arr.ratingsLine({ tmdb: '8.1', imdb: '8.2/10', rt: '95%' }), 'TMDb: 8.1 • IMDb: 8.2/10 • RT: 95%');
  const notes = parseReleaseNotes('## Changes\n\n**New:**\n- Show size in history details (#1234)\n- Option two\n\n**Fixed:**\n- Deleting movie folder fails\n\nOther text');
  assert.deepEqual(notes.new, ['Show size in history details', 'Option two']);
  assert.deepEqual(notes.fixed, ['Deleting movie folder fails']);
  // the shape Radarr/Lidarr actually publish: "* <sha> Fixed: …", plus Sonarr's "* Fixed: … by @user in <pr>"
  const real = parseReleaseNotes('*Docker note*\n\n## Changes:\n\n* 886db23c58f13e63537c99d0173c2bbfdd7af253 Multiple Translations updated by Weblate\n* b646386e77706031d8a198884205a5b5fada696f Update state with the filtered movie file languages\n* 4aa259a666097b34cf9a2cf21197b43576b5ecf3 Automated API Docs update\n* 35f1a61bf800c4eadfb959435bd33f39844f799d Fixed: Updating movie files via Manage Files\n* f7da5b0866b3cdfb80108c79b52deca9fbf848da Bump version to 5.21.1\n* 682cc70acf6b4ba7e5b2806ae92f435b43b1d67f Fixed: Drop downs flickering in some cases [ #10869 ]\n* c52c7f438764e793529e0cdbfdcc12400ff6fc35 New: Filter movies by movie file quality\n### Changes\n* Fixed: Unexpected languages stored in DB will be treated as Unknown by @mynameisbogdan in https://github.com/Sonarr/Sonarr/pull/8810\n');
  assert.deepEqual(real.new, ['Filter movies by movie file quality']);
  assert.deepEqual(real.fixed, ['Updating movie files via Manage Files', 'Drop downs flickering in some cases', 'Unexpected languages stored in DB will be treated as Unknown']);
  assert.deepEqual(real.other, ['Update state with the filtered movie file languages']);
  assert.equal(arr.mediaInfoLine({ width: 3840, height: 2160, videoDynamicRangeType: 'HDR10', videoCodec: 'x265', audioCodec: 'EAC3 Atmos', audioChannels: 5.1, subtitles: ['eng'] }), '3840x2160 • HDR10 • x265 • EAC3 Atmos 5.1 • subs: eng');
});

test('radarr: Grab → Notifiarr layout with enrichment (rating/quality/runtime, ratings, awards, Trakt, languages, custom formats)', async () => {
  const p = require('../src/parsers/radarr');
  const [e] = await p.parse(truman, config, { services: { enrich: stubEnrich } });
  assert.equal(e.event, 'Grab');
  assert.equal(e.author.name, 'Grabbed — Radarr');
  assert.equal(e.author.icon_url, 'https://i/radarr.png');
  assert.equal(e.title, 'The Truman Show (1998)');
  assert.equal(e.url, 'https://www.themoviedb.org/movie/37165');
  assert.equal(e.description, '*On the air. Unaware.*');
  assert.equal(field(e, 'Rating').value, 'PG');
  assert.equal(field(e, 'Quality').value, 'Bluray-1080p');
  assert.equal(field(e, 'Runtime').value, '1h 43m');
  assert.equal(field(e, 'Size').value, '8.7 GB');
  assert.equal(field(e, 'Ratings').value, 'TMDb: 8.1 • IMDb: 8.2/10 • RT: 95% • MC: 90');
  assert.match(field(e, 'Awards').value, /Oscars/);
  assert.match(field(e, 'Links').value, /\[TMDb\]\(https:\/\/www\.themoviedb\.org\/movie\/37165\) • \[IMDb\]\(https:\/\/www\.imdb\.com\/title\/tt0120382\) • \[Trakt\]\(https:\/\/trakt\.tv\/search\/tmdb\/37165\?id_type=movie\)/);
  assert.equal(field(e, 'Indexer').value, 'DrunkenSlug (Prowlarr)');
  assert.equal(field(e, 'Download Client').value, 'sab');
  assert.equal(field(e, 'Languages').value, '```\nOriginal: English\nRelease: English\n```');
  assert.equal(field(e, 'Custom Formats').value, '```\nScore : 1700\nFormat: HD Bluray Tier 03, x264\n```');
  assert.equal(field(e, 'Release').value, '`The.Truman.Show.1998.1080p.BluRay.x264-FraMeSToR`');
  assert.equal(e.thumbnail.url, 'https://img/poster.jpg');
  assert.equal(e.image.url, 'https://img/fanart.jpg');
  assert.equal(e.route, 'media');
});

test('radarr: Download with isUpgrade → "Upgraded", media info line; without enrichment nothing breaks', async () => {
  const p = require('../src/parsers/radarr');
  const body = { ...truman, eventType: 'Download', isUpgrade: true, release: undefined,
    movieFile: { relativePath: 'The Truman Show (1998).mkv', quality: 'Bluray-2160p', size: 22000000000, releaseGroup: 'FraMeSToR', sceneName: 'The.Truman.Show.1998.2160p',
      mediaInfo: { width: 3840, height: 2160, videoDynamicRangeType: 'HDR10', videoCodec: 'x265', audioCodec: 'TrueHD Atmos', audioChannels: 7.1, subtitles: ['eng', 'spa'] } } };
  const [e] = await p.parse(body, config);
  assert.equal(e.event, 'Upgrade');
  assert.equal(e.author.name, 'Upgraded — Radarr');
  assert.equal(e.color, arr.COLORS.upgrade);
  assert.equal(field(e, 'Media Info').value, '3840x2160 • HDR10 • x265 • TrueHD Atmos 7.1 • subs: eng, spa');
  assert.equal(field(e, 'Quality').value, 'Bluray-2160p');
  assert.equal(field(e, 'Ratings'), undefined);
  assert.equal(field(e, 'Runtime'), undefined);
});

test('radarr: ApplicationUpdate → versions + New/Fixed code blocks from release notes, updates route; Health routes by level', async () => {
  const p = require('../src/parsers/radarr');
  const [u] = await p.parse({ eventType: 'ApplicationUpdate', message: 'Radarr updated from 5.20.2.9777 to 5.21.1.9799', previousVersion: '5.20.2.9777', newVersion: '5.21.1.9799' }, config, { services: { enrich: stubEnrich } });
  assert.equal(u.event, 'ApplicationUpdate');
  assert.equal(u.title, 'Radarr Application Updated - Radarr');
  assert.equal(u.url, 'https://github.com/radarr/releases/tag/v5.21.1.9799');
  assert.equal(field(u, 'Old Version').value, '5.20.2.9777');
  assert.equal(field(u, 'New Version').value, '5.21.1.9799');
  assert.equal(field(u, 'New').value, '```\n1. Show size in history details\n2. Option to treat downloads with non-media extensions as failed\n```');
  assert.match(field(u, 'Fixed').value, /1\. Deleting movie folder/);
  assert.equal(u.route, 'updates');
  const [plain] = await p.parse({ eventType: 'ApplicationUpdate', message: 'Radarr updated', previousVersion: '1', newVersion: '2' }, config);
  assert.equal(field(plain, 'New Version').value, '2');
  assert.equal(field(plain, 'New'), undefined);

  const [h] = await p.parse({ eventType: 'Health', level: 'error', message: 'Indexers unavailable due to failures: NZBgeek', type: 'IndexerStatusCheck', wikiUrl: 'https://wiki.servarr.com/radarr/system#indexers-are-unavailable-due-to-failures' }, config);
  assert.equal(h.event, 'Health');
  assert.equal(h.route, 'warning');
  assert.equal(h.title, 'Radarr health error');
  assert.match(field(h, 'Wiki').value, /wiki\.servarr\.com/);
  const [r] = await p.parse({ eventType: 'HealthRestored', level: 'ok', message: 'All indexers are available again', type: 'IndexerStatusCheck' }, config);
  assert.equal(r.event, 'HealthRestored');
  assert.equal(r.route, 'daily');
  assert.equal(r.color, arr.COLORS.restored);

  const [m] = await p.parse({ eventType: 'ManualInteractionRequired', movie: truman.movie, downloadClient: 'sab', downloadStatus: 'Warning', downloadInfo: { title: 'The.Truman.Show.1998.1080p', quality: 'Bluray-1080p', size: 9000000000 }, downloadStatusMessages: [{ title: 'The.Truman.Show.1998.1080p', messages: ['No files found are eligible for import'] }] }, config);
  assert.equal(m.event, 'ManualInteractionRequired');
  assert.match(field(m, 'Messages').value, /No files found/);
  assert.equal(m.title, 'The Truman Show (1998)');
});

test('sonarr: Download → episode line, network from enrichment, media info, four links', async () => {
  const p = require('../src/parsers/sonarr');
  const body = { eventType: 'Download', isUpgrade: false,
    series: { id: 12, title: 'Severance', tvdbId: 371980, tmdbId: 95396, imdbId: 'tt11280740', type: 'standard', year: 2022, genres: ['Drama', 'Mystery'], images: [{ coverType: 'poster', remoteUrl: 'https://img/p.jpg' }, { coverType: 'fanart', remoteUrl: 'https://img/f.jpg' }], originalLanguage: { id: 1, name: 'English' } },
    episodes: [{ id: 4401, episodeNumber: 7, seasonNumber: 2, title: 'Chikhai Bardo', overview: 'Gemma and Mark reckon with their past.', airDate: '2025-02-28' }],
    episodeFile: { relativePath: 'Season 02/Severance - S02E07.mkv', quality: 'WEBDL-2160p', releaseGroup: 'NTb', sceneName: 'Severance.S02E07.2160p.ATVP.WEB-DL.DDPA5.1.HDR.H.265-NTb', size: 6872000000, mediaInfo: { width: 3840, height: 2160, videoDynamicRangeType: 'HDR10', videoCodec: 'x265', audioCodec: 'EAC3 Atmos', audioChannels: 5.1, subtitles: ['eng'] }, languages: [{ id: 1, name: 'English' }] },
    release: { quality: 'WEBDL-2160p', releaseGroup: 'NTb', releaseTitle: 'Severance.S02E07.2160p.ATVP.WEB-DL.DDPA5.1.HDR.H.265-NTb', indexer: 'NZBgeek (Prowlarr)', size: 6872000000 },
    downloadClient: 'sab', customFormatInfo: { customFormats: [{ id: 11, name: 'WEB Tier 01' }, { id: 21, name: 'HDR10' }], customFormatScore: 2250 } };
  const [e] = await p.parse(body, config, { services: { enrich: stubEnrich } });
  assert.equal(e.event, 'Download');
  assert.equal(e.author.name, 'Imported — Sonarr');
  assert.equal(e.title, 'Severance (S02E07)');
  assert.equal(field(e, 'Episode').value, 'S02E07 - Chikhai Bardo');
  assert.equal(field(e, 'Rating').value, 'TV-MA');
  assert.equal(field(e, 'Network').value, 'Apple TV+');
  assert.equal(field(e, 'Air Date').value, '2025-02-28');
  assert.equal(field(e, 'Ratings').value, 'TMDb: 8.6 • IMDb: 8.7/10');
  assert.equal(field(e, 'Media Info').value, '3840x2160 • HDR10 • x265 • EAC3 Atmos 5.1 • subs: eng');
  assert.match(field(e, 'Links').value, /\[TheTVDB\].*\[IMDb\].*\[TMDb\].*\[Trakt\]\(https:\/\/trakt\.tv\/search\/tvdb\/371980\?id_type=show\)/);
  assert.equal(field(e, 'Custom Formats').value, '```\nScore : 2250\nFormat: WEB Tier 01, HDR10\n```');
  assert.equal(e.image.url, 'https://img/f.jpg');
  const [multi] = await p.parse({ eventType: 'Grab', series: body.series, episodes: [{ seasonNumber: 1, episodeNumber: 1, title: 'A' }, { seasonNumber: 1, episodeNumber: 2, title: 'B' }, { seasonNumber: 1, episodeNumber: 3 }, { seasonNumber: 1, episodeNumber: 4 }], release: { quality: 'HDTV-1080p' } }, config);
  assert.equal(multi.title, 'Severance (S01E01–S01E04)');
  assert.equal(field(multi, 'Episodes').value.split('\n').length, 4);
});

test('lidarr: Download → artist/type/quality triplet, MusicBrainz link, upgrade label', async () => {
  const p = require('../src/parsers/lidarr');
  const [e] = await p.parse({ eventType: 'Download', isUpgrade: true, artist: { name: 'Boards of Canada', mbId: 'a1', genres: ['Electronic'], images: [{ coverType: 'fanart', remoteUrl: 'https://img/a.jpg' }] },
    album: { title: 'Geogaddi', releaseDate: '2002-02-18', albumType: 'Album', mbId: 'rg1', images: [{ coverType: 'cover', remoteUrl: 'https://img/c.jpg' }] },
    tracks: [{ title: 'Music Is Math' }, { title: 'Gyroscope' }], trackFiles: [{ quality: 'FLAC', size: 400000000 }, { quality: 'FLAC', size: 420000000 }], downloadClient: 'sab', release: { releaseTitle: 'Boards.of.Canada-Geogaddi-FLAC', indexer: 'NZBgeek' } }, config);
  assert.equal(e.event, 'Upgrade');
  assert.equal(e.author.name, 'Upgraded — Lidarr');
  assert.equal(e.title, 'Geogaddi (2002)');
  assert.equal(field(e, 'Artist').value, 'Boards of Canada');
  assert.equal(field(e, 'Tracks').value, '2');
  assert.equal(field(e, 'Quality').value, 'FLAC');
  assert.match(field(e, 'Links').value, /musicbrainz\.org\/release-group\/rg1/);
  assert.equal(e.thumbnail.url, 'https://img/c.jpg');
});

test('enricher: github release notes fetched once and cached, failures swallowed, providers reported', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/releases/tags/v5.21.1.9799')) return { ok: true, status: 200, json: async () => ({ html_url: 'https://github.com/Radarr/Radarr/releases/tag/v5.21.1.9799', body: '**New:**\n- A\n**Fixed:**\n- B' }) };
    if (url.includes('themoviedb.org/3/movie/37165')) return { ok: true, status: 200, json: async () => ({ runtime: 103, vote_average: 8.146, tagline: 'T', imdb_id: 'tt0120382', production_companies: [{ name: 'Paramount' }], release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG' }] }] } }) };
    if (url.includes('omdbapi.com')) return { ok: true, status: 200, json: async () => ({ Response: 'True', imdbRating: '8.2', Metascore: '90', Ratings: [{ Source: 'Rotten Tomatoes', Value: '95%' }], Rated: 'PG', Awards: 'Nominated for 3 Oscars' }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const metrics = new Metrics();
  const en = new Enricher({ tmdbKey: 'k', omdbKey: 'o', fetchImpl, metrics, log: quietLog });
  assert.deepEqual(en.providers, { tmdb: true, omdb: true, github: true });
  const notes = await en.release('radarr', '5.21.1.9799');
  assert.deepEqual([notes.new, notes.fixed], [['A'], ['B']]);
  await en.release('radarr', '5.21.1.9799');
  assert.equal(calls.filter(u => u.includes('releases/tags')).length, 1, 'cached');
  assert.equal(await en.release('radarr', '9.9.9'), null);
  assert.equal(await en.release('unknownapp', '1'), null);
  const m = await en.movie({ tmdbId: 37165 });
  assert.equal(m.runtime, 103);
  assert.equal(m.certification, 'PG');
  assert.deepEqual(m.ratings, { tmdb: '8.1', imdb: '8.2/10', metacritic: '90', rt: '95%' });
  assert.equal(m.awards, 'Nominated for 3 Oscars');
  assert.equal(metrics.get('enrich_total', { provider: 'tmdb', outcome: 'ok' }), 1);
  const off = new Enricher({ github: false, fetchImpl, log: quietLog });
  assert.equal(await off.release('radarr', '5.21.1.9799'), null);
  assert.equal(await off.movie({ tmdbId: 1 }), null);
  const broken = new Enricher({ tmdbKey: 'k', fetchImpl: async () => { throw new Error('boom'); }, log: quietLog });
  assert.equal(await broken.movie({ tmdbId: 1 }), null);
});

test('app: per-event routing overrides from sources.<s>.events (route change and off)', async t => {
  const fake = await startFakeDiscord();
  const app = await startApp(fake, { sources: { radarr: { dedup_window_sec: 0, route: 'media', events: { Grab: 'daily', Health: 'off' } } } });
  t.after(async () => { await app.close(); await fake.close(); });
  const auth = { 'x-relay-token': 'test-token-0123456789' };
  const before = fake.received.length;
  assert.equal((await (await app.post('/webhook/radarr', truman, auth)).json()).queued, 1);
  const [done] = await waitDone(app, 1);
  assert.equal(done.route, 'daily');
  assert.match(fake.received[before].path, /daily-token$/);
  assert.equal(fake.received[before].body.embeds[0].event, undefined, 'event key never reaches Discord');
  const h = await (await app.post('/webhook/radarr', { eventType: 'Health', level: 'warning', message: 'x', type: 'y' }, auth)).json();
  assert.deepEqual([h.queued, h.suppressed, h.dropped], [0, 0, 0]);
  const d = await (await app.post('/webhook/radarr', { ...truman, eventType: 'Download' }, auth)).json();
  assert.equal(d.queued, 1);
  const [done2] = await waitDone(app, 1);
  assert.equal(done2.route, 'media');
});
