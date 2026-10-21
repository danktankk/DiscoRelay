'use strict';

const PREFIX = 'discorelay_';

function labelKey(labels) {
  return Object.keys(labels).sort().map(k => `${k}=${JSON.stringify(String(labels[k]))}`).join(',');
}

function escapeLabel(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Minimal Prometheus text-format registry (counters + gauges), no dependency. */
class Metrics {
  constructor() {
    this.counters = new Map(); // name -> Map(labelKey -> {labels, value})
    this.gauges = new Map();
    this.help = {
      received_total: 'Webhook requests accepted by source',
      queued_total: 'Payloads queued for Discord by route',
      sent_total: 'Payloads delivered to Discord by route',
      failed_total: 'Payloads that failed permanently by route and reason',
      suppressed_total: 'Payloads suppressed by dedup by source',
      rejected_total: 'Requests rejected before parsing by reason',
      attempts_total: 'Discord delivery attempts by route and outcome',
      queue_depth: 'Payloads waiting per route',
      forward_total: 'Raw payload copies forwarded to extra consumers by source and outcome',
      geoip_total: 'GeoIP lookups by outcome',
      up: 'Process is up',
    };
  }

  _bump(map, name, labels, value, replace) {
    if (!map.has(name)) map.set(name, new Map());
    const series = map.get(name);
    const key = labelKey(labels);
    const cur = series.get(key) || { labels, value: 0 };
    cur.value = replace ? value : cur.value + value;
    series.set(key, cur);
  }

  inc(name, labels = {}, value = 1) { this._bump(this.counters, name, labels, value, false); }
  set(name, labels = {}, value) { this._bump(this.gauges, name, labels, value, true); }

  get(name, labels = {}) {
    const series = this.counters.get(name) || this.gauges.get(name);
    if (!series) return 0;
    const hit = series.get(labelKey(labels));
    return hit ? hit.value : 0;
  }

  render() {
    const lines = [];
    const emit = (type, map) => {
      for (const [name, series] of map) {
        lines.push(`# HELP ${PREFIX}${name} ${this.help[name] || name}`);
        lines.push(`# TYPE ${PREFIX}${name} ${type}`);
        for (const { labels, value } of series.values()) {
          const lbl = Object.keys(labels).length
            ? '{' + Object.keys(labels).sort().map(k => `${k}="${escapeLabel(labels[k])}"`).join(',') + '}'
            : '';
          lines.push(`${PREFIX}${name}${lbl} ${value}`);
        }
      }
    };
    emit('counter', this.counters);
    emit('gauge', this.gauges);
    return lines.join('\n') + '\n';
  }
}

module.exports = { Metrics };
