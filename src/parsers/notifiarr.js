// Notifiarr "passthrough" compatible endpoint. Scripts written for
//   https://notifiarr.com/api/v1/notification/passthrough
// work unchanged against  http://<hub>:3080/webhook/notifiarr?token=...  (or /api/v1/notification/passthrough).
// Schema (notifiarr.wiki → Integrations → Passthrough):
//   notification: { update, name, event }
//   discord: { color, ping: { pingUser, pingRole }, images: { thumbnail, image },
//              text: { title, icon, content, description, fields: [{ title, text, inline }], footer },
//              ids: { channel } }
// Route: ?route= query, else config.channels[ids.channel], else sources.notifiarr.route, else "daily".
function str(v) { return v === undefined || v === null ? '' : String(v); }

function parseColor(c) {
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  const s = str(c).replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return parseInt(s, 16);
}

module.exports = {
  name: 'Notifiarr passthrough',
  parse(body, config, ctx = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be a Notifiarr passthrough JSON object');
    const n = body.notification || {};
    const d = body.discord || {};
    const text = d.text || {};
    const images = d.images || {};
    const ping = d.ping || {};
    const ids = d.ids || {};
    const name = str(n.name) || 'Passthrough';
    const query = ctx.query || {};
    const channels = config.channels || {};
    const cfg = (config.sources && config.sources.notifiarr) || {};

    let route = (typeof query.route === 'string' && query.route) || (ids.channel !== undefined && channels[String(ids.channel)]) || (cfg.route && cfg.route !== 'auto' ? cfg.route : '') || 'daily';
    if (!config.discord || !config.discord[route]) throw new Error(`unknown route: ${route}`);

    const fields = [];
    if (Array.isArray(text.fields)) {
      for (const f of text.fields.slice(0, 25)) {
        if (!f) continue;
        fields.push({ name: str(f.title || f.name).slice(0, 256) || '​', value: (str(f.text || f.value) || '​').slice(0, 1024), inline: f.inline === true });
      }
    }
    const description = str(text.description);
    if (!str(text.title) && !description && !fields.length && !str(text.content)) throw new Error('passthrough needs a title, description, fields or content');

    const embed = {
      author: { name: name.slice(0, 256), icon_url: /^https?:\/\//.test(str(text.icon)) ? text.icon : undefined },
      title: str(text.title).slice(0, 256) || undefined,
      description: description.slice(0, 4000) || undefined,
      fields,
      color: parseColor(d.color) ?? (cfg.color !== undefined ? parseColor(cfg.color) : null) ?? 0x3B82F6,
      thumbnail: /^https?:\/\//.test(str(images.thumbnail)) ? { url: images.thumbnail } : undefined,
      image: /^https?:\/\//.test(str(images.image)) ? { url: images.image } : undefined,
      footer: str(text.footer) ? { text: str(text.footer).slice(0, 2048) } : undefined,
      timestamp: new Date().toISOString(),
    };

    const mentions = [];
    if (ping.pingUser && String(ping.pingUser) !== '0') mentions.push(`<@${ping.pingUser}>`);
    if (ping.pingRole && String(ping.pingRole) !== '0') mentions.push(`<@&${ping.pingRole}>`);
    const content = [str(text.content), mentions.join(' ')].filter(Boolean).join(' ').slice(0, 2000);

    const out = { embeds: [embed] };
    if (content) out.content = content;
    return { payloads: [{ route, body: out }] };
  },
};
