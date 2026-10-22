/* DiscoRelay setup page. Vanilla JS, no build step. Talks to /api/admin/* with the relay token. */
(() => {
  'use strict';
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TOKEN_KEY = 'discorelay.token';
  let token = '';
  try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch { token = ''; }
  let overview = null;
  let view = 'overview';

  // ---------- API ----------
  async function api(method, path, body) {
    const res = await fetch('/api/admin' + path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 401) { throw Object.assign(new Error('unauthorized'), { status: 401 }); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
    return data;
  }
  const get = p => api('GET', p);

  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('bad', !!bad); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // ---------- gate ----------
  function showGate(err) {
    $('#gate').hidden = false; $('#shell').hidden = true;
    const e = $('#gate-error'); e.hidden = !err; e.textContent = err || '';
  }
  $('#gate-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    token = $('#gate-token').value.trim();
    try { await get('/overview'); try { localStorage.setItem(TOKEN_KEY, token); } catch { /* private window */ } boot(); }
    catch (err) { showGate(err.status === 401 ? 'That token has no admin scope.' : err.message); }
  });
  $('#logout').addEventListener('click', () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } token = ''; showGate(); });

  // ---------- shell ----------
  async function boot() {
    try { overview = await get('/overview'); }
    catch (err) { return showGate(err.status === 401 ? (token ? 'That token has no admin scope.' : '') : 'Hub unreachable: ' + err.message); }
    $('#gate').hidden = true; $('#shell').hidden = false;
    $('#version').textContent = 'v' + overview.version;
    pulse();
    render();
    if (!boot.timer) boot.timer = setInterval(async () => { try { overview = await get('/overview'); pulse(); if (view === 'overview') render(); } catch { pulse(true); } }, 30000);
  }
  function pulse(bad) {
    const p = $('#pulse');
    const dbOk = overview && (!overview.db.enabled || overview.db.ok);
    p.className = 'pulse ' + (bad || !dbOk ? 'bad' : 'ok');
    p.textContent = bad ? 'hub unreachable' : `${overview.db.enabled ? (overview.db.ok ? 'postgres ok' : 'postgres down') : 'no history db'} · up ${fmtDur(overview.uptime_sec)}`;
  }
  $('#nav').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-view]'); if (!b) return;
    view = b.dataset.view; $$('#nav button').forEach(x => x.classList.toggle('active', x === b)); closeInspector(); render();
  });
  $('#inspector-close').addEventListener('click', closeInspector);
  function openInspector(title, html) { $('#inspector-title').textContent = title; $('#inspector-body').innerHTML = html; $('#inspector').hidden = false; $('#shell').classList.add('with-inspector'); }
  function closeInspector() { $('#inspector').hidden = true; $('#shell').classList.remove('with-inspector'); }

  function fmtDur(s) { if (s < 90) return s + 's'; if (s < 5400) return Math.round(s / 60) + 'm'; if (s < 172800) return Math.round(s / 3600) + 'h'; return Math.round(s / 86400) + 'd'; }
  function ago(iso) { if (!iso) return '—'; const d = (Date.now() - Date.parse(iso)) / 1000; return d < 60 ? 'just now' : fmtDur(d) + ' ago'; }
  function routeTag(r) { return `<span class="route-tag" data-route="${esc(r)}">${esc(r)}</span>`; }
  function routeOptions(selected, extra = []) {
    const names = (overview ? overview.routes.map(r => r.name) : []);
    return extra.concat(names.map(n => ({ v: n, l: n }))).map(o => `<option value="${esc(o.v)}"${o.v === selected ? ' selected' : ''}>${esc(o.l)}</option>`).join('');
  }

  async function render() {
    const main = $('#main');
    try {
      if (view === 'overview') main.innerHTML = viewOverview();
      else if (view === 'sources') main.innerHTML = viewSources(await get('/sources'));
      else if (view === 'routes') main.innerHTML = viewRoutes(await get('/routes'));
      else if (view === 'history') { main.innerHTML = viewHistoryShell(); await loadHistory(); }
      else if (view === 'senders') main.innerHTML = viewSenders(await get('/senders'));
      else if (view === 'settings') main.innerHTML = viewSettings(await get('/settings'));
    } catch (err) { main.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
  }

  // ---------- Board ----------
  function viewOverview() {
    const o = overview;
    const sent = o.sources.reduce((n, s) => n + ((s.stats && s.stats.sent) || 0), 0);
    const failed = o.sources.reduce((n, s) => n + ((s.stats && s.stats.failed) || 0), 0);
    const suppressed = o.sources.reduce((n, s) => n + ((s.stats && s.stats.suppressed) || 0), 0);
    const queued = Object.values(o.queue || {}).reduce((a, b) => a + b, 0);
    const lanes = o.routes.map(r => {
      const feeders = o.sources.filter(s => s.route === r.name || Object.values(s.event_routes || {}).includes(r.name));
      return `<div class="lane" data-route="${esc(r.name)}">
        <div><div class="name">#${esc(r.name)}</div><div class="meta">${r.masked ? esc(r.masked) : '<span class="chip fail">no webhook</span>'}${r.overridden ? ' <span class="badge">db</span>' : ''}</div></div>
        <div class="chips">${feeders.map(s => `<span class="chip">${esc(s.name)}</span>`).join('') || '<span class="chip quiet">nothing routed here</span>'}</div>
        <div class="meta">${r.stats ? `${r.stats.sent} sent · ${r.stats.failed ? `<span class="chip fail">${r.stats.failed} failed</span>` : '0 failed'} · last ${ago(r.stats.last_sent_at)}` : 'no traffic 24h'}${r.queue ? ` · <span class="chip">${r.queue} queued</span>` : ''}</div>
      </div>`;
    }).join('');
    const quiet = o.sources.filter(s => !s.stats);
    return `<h1>Board</h1><p class="lede">What reached Discord in the last 24 hours, channel by channel.</p>
      <div class="strip">
        <div class="stat"><b>${sent}</b><small>delivered 24h</small></div>
        <div class="stat${failed ? ' bad' : ''}"><b>${failed}</b><small>failed 24h</small></div>
        <div class="stat"><b>${suppressed}</b><small>deduped 24h</small></div>
        <div class="stat"><b>${queued}</b><small>in queue</small></div>
        <div class="stat"><b>${o.sources.filter(s => s.stats).length}/${o.sources.length}</b><small>sources active</small></div>
        <div class="stat"><b>${o.enrich.tmdb || o.enrich.omdb ? 'on' : 'off'}</b><small>metadata enrichment</small></div>
      </div>
      <h2>Channels</h2><div class="lanes">${lanes}</div>
      ${o.failed_recent && o.failed_recent.length ? `<h2>Recent failures</h2><table class="table"><tbody>${o.failed_recent.map(r => `<tr class="clickable" data-id="${r.id}"><td>${esc(r.source)}</td><td>${routeTag(r.route)}</td><td>${esc(r.title || '')}</td><td class="mono">${esc(r.last_error || '')}</td><td><small>${ago(r.received_at)}</small></td></tr>`).join('')}</tbody></table>` : ''}
      ${quiet.length ? `<h2>Quiet sources (nothing in 24h)</h2><div class="chips">${quiet.map(s => `<span class="chip quiet">${esc(s.name)}</span>`).join(' ')}</div>` : ''}`;
  }
  $('#main').addEventListener('click', async ev => {
    const row = ev.target.closest('tr.clickable[data-id]');
    if (row) { try { showNotification(await get('/history/' + row.dataset.id)); } catch (err) { toast(err.message, true); } }
  });

  // ---------- Sources ----------
  function viewSources(list) {
    return `<h1>Sources</h1><p class="lede">Where each sender's events go. Pick a channel per event, mute the noisy ones, forward raw payloads to another consumer. Saved to the hub's database and applied instantly.</p>
      ${list.map(s => `<div class="source-card" data-source="${esc(s.name)}">
        <div class="source-head">${s.icon ? `<img src="${esc(s.icon)}" alt="">` : ''}<span class="name">${esc(s.label)}</span><code>/webhook/${esc(s.name)}</code>${s.overridden ? '<span class="badge">customised</span>' : ''}<span class="spacer"></span>
          ${s.stats ? `<small>${s.stats.sent} sent 24h</small>` : ''}</div>
        <div class="source-grid">
          <div class="field"><label>Default channel</label><select name="route">${routeOptions(s.route, [{ v: 'auto', l: 'auto (parser decides)' }])}</select></div>
          <div class="field"><label>Dedup window (seconds, 0 = never suppress)</label><input name="dedup_window_sec" type="number" min="0" value="${esc(s.dedup_window_sec)}"></div>
          <div class="field"><label>Forward raw payload to (one URL per line)</label><textarea name="forward" rows="2">${esc((s.forward || []).join('\n'))}</textarea></div>
          <div class="field"><label>Icon URL</label><input name="icon" value="${esc(s.icon)}"></div>
        </div>
        ${s.events.length ? `<div class="events">${s.events.map(ev => { const r = s.event_routes[ev] || ''; return `<span class="event" data-route="${esc(r || s.route)}" data-event="${esc(ev)}">${esc(ev)} <select>${routeOptions(r, [{ v: '', l: 'default' }, { v: 'off', l: 'mute' }])}</select></span>`; }).join('')}</div>` : '<small>This parser routes by severity; set the default channel to auto or pin one.</small>'}
        <div class="actions"><button data-act="save">Save</button><button class="quiet" data-act="test">Send sample</button>${s.overridden ? '<button class="ghost" data-act="reset">Back to config.json</button>' : ''}</div>
      </div>`).join('')}`;
  }
  $('#main').addEventListener('change', ev => {
    const chip = ev.target.closest('.event'); if (chip && ev.target.tagName === 'SELECT') chip.dataset.route = ev.target.value || chip.closest('.source-card').querySelector('select[name=route]').value;
  });
  $('#main').addEventListener('click', async ev => {
    const b = ev.target.closest('button[data-act]'); if (!b) return;
    const card = b.closest('.source-card'); if (!card) return;
    const name = card.dataset.source;
    try {
      if (b.dataset.act === 'save') {
        const events = {};
        $$('.event', card).forEach(c => { events[c.dataset.event] = c.querySelector('select').value || null; });
        const body = { route: $('select[name=route]', card).value, dedup_window_sec: $('input[name=dedup_window_sec]', card).value, forward: $('textarea[name=forward]', card).value, icon: $('input[name=icon]', card).value, events };
        await api('PUT', '/sources/' + name, body);
        toast(`${name} saved`); overview = await get('/overview'); render();
      } else if (b.dataset.act === 'reset') {
        await api('DELETE', '/sources/' + name); toast(`${name} back to config.json`); overview = await get('/overview'); render();
      } else if (b.dataset.act === 'test') {
        const sample = SAMPLES[name];
        if (!sample) return toast('No sample payload for this source yet; use Preview in History.', true);
        const res = await fetch('/webhook/' + name, { method: 'POST', headers: { 'content-type': 'application/json', 'x-relay-token': token }, body: JSON.stringify(sample) });
        const j = await res.json().catch(() => ({}));
        toast(res.ok ? `sample sent: queued ${j.queued}, suppressed ${j.suppressed}` : `sample failed: ${j.error || res.status}`, !res.ok);
      }
    } catch (err) { toast(err.message, true); }
  });

  // ---------- Channels ----------
  function viewRoutes(list) {
    return `<h1>Channels</h1><p class="lede">One Discord webhook per channel. Paste a new webhook here to rotate it without touching .env; "test" drops a sample embed in that channel.</p>
      <table class="table"><thead><tr><th>Channel</th><th>Webhook</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr data-route="${esc(r.name)}"><td>${routeTag(r.name)}</td><td><span class="mono">${esc(r.masked || '—')}</span>${r.overridden ? ' <span class="badge">db</span>' : ''}</td>
        <td class="actions"><input name="webhook" placeholder="https://discord.com/api/webhooks/…" size="38"><button data-ract="save">Save</button><button class="quiet" data-ract="test">Test</button>${r.overridden ? '<button class="ghost" data-ract="reset">Use .env</button>' : ''}</td></tr>`).join('')}
      <tr data-route=""><td><input name="newname" placeholder="new channel" size="12"></td><td colspan="2" class="actions"><input name="webhook" placeholder="https://discord.com/api/webhooks/…" size="38"><button data-ract="add">Add channel</button></td></tr>
      </tbody></table>
      <p><small>Route names are what senders use (<code>?route=</code>) and what the Sources page lists. Adding a channel here makes it selectable immediately.</small></p>`;
  }
  $('#main').addEventListener('click', async ev => {
    const b = ev.target.closest('button[data-ract]'); if (!b) return;
    const tr = b.closest('tr'); const route = tr.dataset.route || ($('input[name=newname]', tr) || {}).value;
    try {
      if (b.dataset.ract === 'save' || b.dataset.ract === 'add') {
        const webhook = $('input[name=webhook]', tr).value.trim();
        if (!route) return toast('channel name?', true);
        await api('PUT', '/routes/' + encodeURIComponent(route), { webhook });
        toast(`#${route} saved`);
      } else if (b.dataset.ract === 'test') { await api('POST', '/routes/' + route + '/test'); toast(`test queued → #${route}`); return; }
      else if (b.dataset.ract === 'reset') { await api('DELETE', '/routes/' + route); toast(`#${route} back to .env`); }
      overview = await get('/overview'); render();
    } catch (err) { toast(err.message, true); }
  });

  // ---------- History ----------
  function viewHistoryShell() {
    return `<h1>History</h1><p class="lede">Every notification the hub accepted, with the embed exactly as Discord received it. Click a row to preview or resend.</p>
      <div class="filters"><input id="h-q" placeholder="search title"><select id="h-source"><option value="">all sources</option>${(overview.sources || []).map(s => `<option>${esc(s.name)}</option>`).join('')}</select>
      <select id="h-status"><option value="">any status</option><option>sent</option><option>failed</option><option>suppressed</option><option>dropped</option><option>queued</option></select>
      <select id="h-route"><option value="">any channel</option>${routeOptions('')}</select><button id="h-go" class="quiet">Filter</button><button id="h-preview" class="quiet">Preview a payload…</button></div>
      <div id="h-table"></div>`;
  }
  async function loadHistory() {
    const q = new URLSearchParams({ limit: 100, q: $('#h-q').value, source: $('#h-source').value, status: $('#h-status').value, route: $('#h-route').value });
    const data = await get('/history?' + q);
    const el = $('#h-table');
    if (!data.enabled) { el.innerHTML = '<p class="error">History is off: set DATABASE_URL to keep notifications.</p>'; return; }
    el.innerHTML = `<table class="table"><thead><tr><th>#</th><th>When</th><th>Source</th><th>Channel</th><th>Title</th><th>Status</th><th>Tries</th></tr></thead><tbody>
      ${data.rows.map(r => `<tr class="clickable" data-id="${r.id}"><td class="mono">${r.id}</td><td><small>${ago(r.received_at)}</small></td><td>${esc(r.source)}</td><td>${routeTag(r.route)}</td><td>${esc(r.title || '')}</td><td><span class="status ${esc(r.status)}">${esc(r.status)}</span>${r.last_error ? ` <small class="mono">${esc(r.last_error.slice(0, 60))}</small>` : ''}</td><td>${r.attempts}</td></tr>`).join('') || '<tr><td colspan="7"><small>nothing matches</small></td></tr>'}
      </tbody></table>`;
  }
  $('#main').addEventListener('click', async ev => {
    if (ev.target.id === 'h-go') loadHistory();
    if (ev.target.id === 'h-preview') openPreviewTool();
  });
  $('#main').addEventListener('keydown', ev => { if (ev.target.id === 'h-q' && ev.key === 'Enter') loadHistory(); });

  function showNotification(n) {
    const deliveries = (n.deliveries || []).map(d => `<li><small>${ago(d.attempted_at)}</small> ${d.http_status ? `HTTP ${d.http_status}` : 'no response'}${d.error ? ` — <span class="mono">${esc(d.error)}</span>` : ''}</li>`).join('');
    openInspector(`#${n.id} · ${n.source} → #${n.route}`, `${renderMessage(n.body)}
      <p><span class="status ${esc(n.status)}">${esc(n.status)}</span> ${n.attempts} attempt(s)${n.last_error ? ` · <span class="mono">${esc(n.last_error)}</span>` : ''}</p>
      ${deliveries ? `<ul>${deliveries}</ul>` : ''}
      <div class="actions"><select id="resend-route">${routeOptions(n.route)}</select><button id="resend">Resend</button></div>
      <details><summary><small>raw payload</small></summary><pre class="mono">${esc(JSON.stringify(n.body, null, 2))}</pre></details>`);
    $('#resend').onclick = async () => { try { const r = await api('POST', `/history/${n.id}/resend`, { route: $('#resend-route').value }); toast(`resent as #${r.id} → #${r.route}`); } catch (err) { toast(err.message, true); } };
  }

  function openPreviewTool() {
    openInspector('Preview a payload', `<p><small>Paste what a sender would POST. The hub parses it and shows the embed without sending.</small></p>
      <div class="field"><label>Source</label><select id="pv-source">${(overview.sources || []).map(s => `<option>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Payload JSON</label><textarea id="pv-body" rows="10"></textarea></div>
      <div class="actions"><button id="pv-go">Render</button><button id="pv-sample" class="quiet">Load sample</button></div><div id="pv-out"></div>`);
    $('#pv-sample').onclick = () => { const s = SAMPLES[$('#pv-source').value]; $('#pv-body').value = s ? JSON.stringify(s, null, 2) : '{}'; };
    $('#pv-go').onclick = async () => {
      try {
        const body = JSON.parse($('#pv-body').value || '{}');
        const r = await api('POST', '/preview', { source: $('#pv-source').value, body });
        $('#pv-out').innerHTML = r.payloads.length ? r.payloads.map(p => `<p>${routeTag(p.route)}</p>${renderMessage(p.body)}`).join('') : '<p><small>parser produced nothing (muted or empty)</small></p>';
      } catch (err) { $('#pv-out').innerHTML = `<p class="error">${esc(err.message)}</p>`; }
    };
  }

  // ---------- Discord-style renderer ----------
  function md(s) {
    let t = esc(s);
    t = t.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, c) => `<pre>${c.replace(/\n$/, '')}</pre>`);
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    return t;
  }
  function renderEmbed(e) {
    const color = typeof e.color === 'number' ? '#' + e.color.toString(16).padStart(6, '0') : '#5865f2';
    const fields = (e.fields || []).map(f => `<div class="f${f.inline ? '' : ' block'}"><div class="n">${md(f.name)}</div><div class="v">${md(f.value)}</div></div>`).join('');
    return `<div class="embed" style="border-left-color:${color}">
      ${e.author ? `<div class="author">${e.author.icon_url ? `<img src="${esc(e.author.icon_url)}" alt="">` : ''}<span>${esc(e.author.name)}</span></div>` : ''}
      ${e.title ? `<div class="title">${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}</div>` : ''}
      ${e.description ? `<div class="desc">${md(e.description)}</div>` : ''}
      ${fields ? `<div class="fields">${fields}</div>` : ''}
      ${e.thumbnail && e.thumbnail.url ? `<div class="thumb"><img src="${esc(e.thumbnail.url)}" alt=""></div>` : ''}
      ${e.image && e.image.url ? `<div class="image"><img src="${esc(e.image.url)}" alt=""></div>` : ''}
      ${e.footer && e.footer.text ? `<div class="footer">${esc(e.footer.text)}</div>` : ''}
    </div>`;
  }
  function renderMessage(body) {
    if (!body) return '';
    return `<div class="msg">${body.username ? `<b>${esc(body.username)}</b> ` : ''}${body.content ? `<div class="content">${md(body.content)}</div>` : ''}${(body.embeds || []).map(renderEmbed).join('')}</div>`;
  }

  // ---------- Wire a sender ----------
  function viewSenders(data) {
    const fill = u => u.replace(/\{HUB\}/g, data.hub).replace(/\{TOKEN\}/g, token);
    return `<h1>Wire a sender</h1><p class="lede">Copy-paste setup for every supported app. URLs below already carry this hub's address and your token; keep them private.</p>
      ${data.snippets.map(s => `<div class="snippet"><h3>${esc(s.title)}</h3><p>${esc(fill(s.how))}</p>
        <div class="url"><code>${esc(fill(s.url))}</code><button class="quiet" data-copy="${esc(fill(s.url))}">Copy</button></div>
        ${(s.also || []).map(u => `<div class="url"><code>${esc(fill(u))}</code><button class="quiet" data-copy="${esc(fill(u))}">Copy</button></div>`).join('')}</div>`).join('')}`;
  }
  $('#main').addEventListener('click', async ev => {
    const b = ev.target.closest('button[data-copy]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('copied'); } catch { toast('clipboard blocked; select the text instead', true); }
  });

  // ---------- Settings ----------
  function viewSettings(s) {
    return `<h1>Settings</h1><p class="lede">Hub-wide knobs. Keys are stored in the hub's database and never shown again in full.</p>
      <div class="source-card"><div class="source-grid">
        <div class="field"><label>Dedup window (seconds)</label><input id="s-dedup" type="number" min="0" value="${esc(s.dedup.window_sec)}"></div>
        <div class="field"><label>GeoIP on CrowdSec bans (ip-api.com)</label><select id="s-geoip"><option value="1"${s.geoip.enabled ? ' selected' : ''}>on</option><option value="0"${!s.geoip.enabled ? ' selected' : ''}>off</option></select></div>
        <div class="field"><label>Map tile zoom</label><input id="s-zoom" type="number" min="1" max="16" value="${esc(s.geoip.zoom)}"></div>
        <div class="field"><label>Release notes for app updates (GitHub)</label><select id="s-github"><option value="1"${s.enrich.github ? ' selected' : ''}>on</option><option value="0"${!s.enrich.github ? ' selected' : ''}>off</option></select></div>
        <div class="field"><label>TMDb API key ${s.enrich.tmdb ? `<span class="badge">set ${esc(s.enrich.tmdb_api_key)}</span>` : '<small>(free: themoviedb.org → settings → API)</small>'}</label><input id="s-tmdb" type="password" placeholder="${s.enrich.tmdb ? 'leave blank to keep' : 'paste key'}"></div>
        <div class="field"><label>OMDb API key ${s.enrich.omdb ? `<span class="badge">set ${esc(s.enrich.omdb_api_key)}</span>` : '<small>(free: omdbapi.com/apikey.aspx, 1000/day)</small>'}</label><input id="s-omdb" type="password" placeholder="${s.enrich.omdb ? 'leave blank to keep' : 'paste key'}"></div>
      </div>
      <div class="actions"><button id="s-save">Save</button><small>History: ${s.store.enabled ? `on, ${s.store.retention_days} days retention` : 'off (no DATABASE_URL) — settings apply until restart only'}</small></div></div>`;
  }
  $('#main').addEventListener('click', async ev => {
    if (ev.target.id !== 's-save') return;
    const body = { dedup: { window_sec: $('#s-dedup').value }, geoip: { enabled: $('#s-geoip').value === '1', zoom: $('#s-zoom').value }, enrich: { github: $('#s-github').value === '1' } };
    if ($('#s-tmdb').value.trim()) body.enrich.tmdb_api_key = $('#s-tmdb').value.trim();
    if ($('#s-omdb').value.trim()) body.enrich.omdb_api_key = $('#s-omdb').value.trim();
    try { await api('PUT', '/settings', body); toast('settings saved'); overview = await get('/overview'); render(); } catch (err) { toast(err.message, true); }
  });

  // ---------- sample payloads for "Send sample" / Preview ----------
  const SAMPLES = {
    radarr: { eventType: 'Grab', movie: { title: 'The Truman Show', year: 1998, tmdbId: 37165, imdbId: 'tt0120382', overview: 'Every second of every day, from the moment he was born, Truman Burbank has been the unwitting star of the longest running, most popular documentary-soap opera in history.', genres: ['Comedy', 'Drama'], images: [{ coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/original/vuza0WqY239yBXOadKlGwJsZJFE.jpg' }, { coverType: 'fanart', remoteUrl: 'https://image.tmdb.org/t/p/original/7JaTxl5Kc7dSUXBYE7aPJ9sdK71.jpg' }], originalLanguage: { name: 'English' } }, release: { quality: 'Bluray-1080p', releaseGroup: 'FraMeSToR', releaseTitle: 'The.Truman.Show.1998.1080p.BluRay.x264-FraMeSToR', indexer: 'DrunkenSlug (Prowlarr)', size: 9331000000, languages: [{ name: 'English' }] }, downloadClient: 'sab', customFormatInfo: { customFormats: [{ name: 'HD Bluray Tier 03' }, { name: 'x264' }], customFormatScore: 1700 } },
    sonarr: { eventType: 'Download', isUpgrade: true, series: { title: 'Severance', tvdbId: 371980, tmdbId: 95396, imdbId: 'tt11280740', year: 2022, genres: ['Drama', 'Mystery', 'Science Fiction'], images: [{ coverType: 'poster', remoteUrl: 'https://artworks.thetvdb.com/banners/v4/series/371980/posters/63a3ee5a0a44e.jpg' }, { coverType: 'fanart', remoteUrl: 'https://artworks.thetvdb.com/banners/v4/series/371980/backgrounds/63a3eecaba00b.jpg' }], originalLanguage: { name: 'English' } }, episodes: [{ episodeNumber: 7, seasonNumber: 2, title: 'Chikhai Bardo', overview: 'Gemma and Mark reckon with their past.', airDate: '2025-02-28' }], episodeFile: { quality: 'WEBDL-2160p', releaseGroup: 'NTb', sceneName: 'Severance.S02E07.2160p.ATVP.WEB-DL.DDPA5.1.HDR.H.265-NTb', size: 6872000000, mediaInfo: { width: 3840, height: 2160, videoDynamicRangeType: 'HDR10', videoCodec: 'x265', audioCodec: 'EAC3 Atmos', audioChannels: 5.1, subtitles: ['eng'] } }, release: { indexer: 'NZBgeek (Prowlarr)' }, downloadClient: 'sab', customFormatInfo: { customFormats: [{ name: 'WEB Tier 01' }, { name: 'HDR10' }], customFormatScore: 2250 } },
    lidarr: { eventType: 'Download', artist: { name: 'Boards of Canada', mbId: '69158f97-4c07-4c4e-baf8-4e4ab1ed666e', genres: ['Electronic'] }, album: { title: 'Geogaddi', releaseDate: '2002-02-18', albumType: 'Album' }, tracks: [{ title: 'Music Is Math' }, { title: 'Gyroscope' }], trackFiles: [{ quality: 'FLAC', size: 400000000 }], downloadClient: 'sab', release: { releaseTitle: 'Boards.of.Canada-Geogaddi-FLAC', indexer: 'NZBgeek' } },
    tautulli: { action: 'play', full_title: 'The Truman Show (1998)', user: 'david', player: 'Shield TV', quality_profile: '1080p', stream_decision: 'direct play', library_name: 'Movies', media_type: 'movie', year: 1998, summary: 'Truman Burbank is the unwitting star of a reality show.', poster_url: 'https://image.tmdb.org/t/p/original/vuza0WqY239yBXOadKlGwJsZJFE.jpg' },
    diun: { diun_version: '4.33.0', hostname: 'secstack', status: 'update', provider: 'docker', image: 'docker.io/crazymax/diun:latest', hub_link: 'https://hub.docker.com/r/crazymax/diun', digest: 'sha256:216e3ae7de4ca8b553eb11ef7abda00651e79e537e85c46108284e5e91673e01', created: '2026-10-20T14:03:00Z', platform: 'linux/amd64', metadata: { ctn_names: 'diun' } },
    crowdsec: [{ ip: '203.0.113.9', scenario: 'crowdsecurity/ssh-bf', action: 'ban', duration: '4h', events_count: 6, machine: 'secstack', start_at: '2026-10-22T10:00:00Z', stop_at: '2026-10-22T10:00:40Z', message: 'IP 203.0.113.9 triggered crowdsecurity/ssh-bf', source: { ip: '203.0.113.9', scope: 'Ip' }, labels: { service: 'sshd', type: 'Ip' } }],
    uptimekuma: { heartbeat: { status: 0, msg: 'Container State is exited', time: '2026-10-22 13:07:24', ping: null }, monitor: { name: 'erugo', type: 'docker', url: 'https://', method: 'GET', timeout: 48, accepted_statuscodes_json: '["200-299"]' }, msg: '[erugo] [🔴 Down] Container State is exited' },
    generic: { title: 'Disk 91%', message: '/var on pve1 is filling up', severity: 'warning', host: 'pve1', source: 'disk-check' },
    discord: { content: 'Hello from the passthrough', username: 'sample' },
    notifiarr: { notification: { name: 'sample' }, discord: { color: '22C55E', text: { title: 'Notifiarr-format sample', description: 'This payload only changed host.', fields: [{ title: 'Field', text: 'value', inline: true }] } } },
  };

  if (token) boot(); else showGate();
})();
