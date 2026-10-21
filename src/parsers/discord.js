// Discord passthrough: any app with native Discord webhook support points at
//   http://<hub>:3080/webhook/discord?route=<route>&token=<token>
// instead of discord.com. The body is forwarded unchanged (content, embeds, username, avatar_url),
// so the hub still gives you auth, dedup, rate-limit handling, retries and history.
const FORWARD_KEYS = ['username', 'avatar_url', 'tts', 'allowed_mentions', 'components', 'flags'];

module.exports = {
  name: 'Discord passthrough',
  parse(body, config, ctx = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be a Discord webhook JSON payload');
    const hasContent = typeof body.content === 'string' && body.content.trim().length > 0;
    const embeds = Array.isArray(body.embeds) ? body.embeds.filter(e => e && typeof e === 'object') : [];
    if (!hasContent && !embeds.length) throw new Error('payload has neither content nor embeds');
    if (embeds.length > 10) throw new Error('Discord allows at most 10 embeds per message');

    const query = ctx.query || {};
    const cfgRoute = config.sources && config.sources.discord && config.sources.discord.route;
    const route = (typeof query.route === 'string' && query.route) || (cfgRoute && cfgRoute !== 'auto' ? cfgRoute : '') || 'daily';
    if (!config.discord || !config.discord[route]) throw new Error(`unknown route: ${route}`);

    const out = {};
    if (hasContent) out.content = body.content.slice(0, 2000);
    if (embeds.length) out.embeds = embeds;
    for (const k of FORWARD_KEYS) if (body[k] !== undefined) out[k] = body[k];
    return { payloads: [{ route, body: out }] };
  },
};
