'use strict';

const { EventEmitter } = require('events');

const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Discord webhook sender.
 *  - one FIFO queue per route, one in-flight request per route (Discord limits are per webhook)
 *  - request timeout, bounded retries with exponential backoff for 5xx / network errors
 *  - honours 429 retry_after (header or body, in seconds) with a cap and a wait budget
 *  - other 4xx are permanent failures (bad payload, deleted webhook)
 *  - every attempt and final outcome is reported to the store and metrics
 */
class DiscordSender extends EventEmitter {
  constructor(config, { store, metrics, log, fetchImpl, sleep } = {}) {
    super();
    this.webhooks = config.discord || {};
    this.opts = config.delivery;
    this.store = store;
    this.metrics = metrics;
    this.log = log || { info() {}, warn() {}, error() {}, debug() {} };
    this.fetch = fetchImpl || globalThis.fetch;
    this.sleep = sleep || sleepDefault;
    this.queues = new Map();
  }

  _queue(route) {
    if (!this.queues.has(route)) this.queues.set(route, { items: [], running: false });
    return this.queues.get(route);
  }

  depths() {
    const out = {};
    for (const [route, q] of this.queues) out[route] = q.items.length + (q.running ? 1 : 0);
    return out;
  }

  /** job: { id, source, route, body } */
  enqueue(job) {
    if (!this.webhooks[job.route]) {
      job.attempts = 0;
      this._finish(job, 'dropped', `no webhook configured for route ${job.route}`);
      return false;
    }
    job.attempts = 0;
    job.rlWaits = 0;
    const q = this._queue(job.route);
    q.items.push(job);
    if (this.metrics) this.metrics.set('queue_depth', { route: job.route }, q.items.length);
    this._run(job.route).catch(err => this.log.error('queue worker crashed', { route: job.route, error: err.message }));
    return true;
  }

  async _run(route) {
    const q = this._queue(route);
    if (q.running) return;
    q.running = true;
    try {
      while (q.items.length) {
        const job = q.items.shift();
        if (this.metrics) this.metrics.set('queue_depth', { route }, q.items.length);
        await this._deliver(job);
      }
    } finally {
      q.running = false;
      this.emit('drain', route);
    }
  }

  _backoff(attempt) {
    return Math.min(this.opts.backoff_base_ms * 2 ** (attempt - 1), this.opts.backoff_max_ms);
  }

  async _deliver(job) {
    const url = this.webhooks[job.route];
    const o = this.opts;
    for (;;) {
      job.attempts += 1;
      let res;
      try {
        res = await this.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(job.body),
          signal: AbortSignal.timeout(o.timeout_ms),
        });
      } catch (err) {
        const reason = err && err.name === 'TimeoutError' ? 'timeout' : `network: ${err && err.message}`;
        await this._attempt(job, null, reason);
        if (job.attempts >= o.max_attempts) return this._finish(job, 'failed', reason);
        await this.sleep(this._backoff(job.attempts));
        continue;
      }

      const text = await res.text().catch(() => '');

      if (res.ok) {
        await this._attempt(job, res.status, null);
        return this._finish(job, 'sent');
      }

      if (res.status === 429) {
        let waitMs = null;
        const header = res.headers.get('retry-after');
        if (header && Number.isFinite(Number(header))) waitMs = Number(header) * 1000;
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.retry_after !== undefined && Number.isFinite(Number(parsed.retry_after))) {
            waitMs = Number(parsed.retry_after) * 1000;
          }
        } catch { /* non-JSON 429 body */ }
        if (!waitMs || waitMs < 0) waitMs = 1000;
        waitMs = Math.min(Math.ceil(waitMs), o.max_rate_limit_wait_ms);
        job.attempts -= 1; // rate limiting is not a delivery failure
        job.rlWaits += 1;
        await this._attempt(job, 429, `rate limited, waiting ${waitMs}ms`);
        if (job.rlWaits > o.max_rate_limit_waits) return this._finish(job, 'failed', 'rate limit wait budget exhausted');
        await this.sleep(waitMs);
        continue;
      }

      if (res.status >= 500) {
        await this._attempt(job, res.status, text.slice(0, 300));
        if (job.attempts >= o.max_attempts) return this._finish(job, 'failed', `HTTP ${res.status}`);
        await this.sleep(this._backoff(job.attempts));
        continue;
      }

      await this._attempt(job, res.status, text.slice(0, 300));
      return this._finish(job, 'failed', `HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  async _attempt(job, httpStatus, error) {
    const outcome = httpStatus && httpStatus < 300 ? 'ok' : httpStatus === 429 ? 'rate_limited' : httpStatus ? `http_${httpStatus}` : 'error';
    if (this.metrics) this.metrics.inc('attempts_total', { route: job.route, outcome });
    if (this.store) {
      try { await this.store.recordAttempt(job.id, httpStatus, error); } catch (err) { this.log.warn('store.recordAttempt failed', { error: err.message }); }
    }
    this.emit('attempt', { id: job.id, route: job.route, attempt: job.attempts, httpStatus, error });
  }

  _finish(job, status, error) {
    if (this.metrics) {
      if (status === 'sent') this.metrics.inc('sent_total', { route: job.route });
      else this.metrics.inc('failed_total', { route: job.route, reason: status === 'dropped' ? 'no_webhook' : 'delivery' });
    }
    const entry = { id: job.id, source: job.source, route: job.route, status, attempts: job.attempts, error: error || null };
    if (status === 'sent') this.log.info('delivered', entry); else this.log.error('delivery failed', entry);
    if (this.store) {
      Promise.resolve()
        .then(() => this.store.finalize(job.id, status, error || null, job.attempts))
        .catch(err => this.log.warn('store.finalize failed', { error: err.message }));
    }
    this.emit('done', entry);
    return entry;
  }

  /** Resolve true when every queue is idle, false after timeoutMs. */
  async drain(timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const busy = [...this.queues.values()].some(q => q.running || q.items.length);
      if (!busy) return true;
      await sleepDefault(50);
    }
    return false;
  }
}

module.exports = DiscordSender;
