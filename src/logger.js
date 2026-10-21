'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function makeLogger(levelName = process.env.LOG_LEVEL || 'info') {
  const threshold = LEVELS[String(levelName).toLowerCase()] ?? LEVELS.info;

  function emit(level, msg, extra) {
    if (LEVELS[level] < threshold) return;
    const line = { ts: new Date().toISOString(), level, msg, ...(extra || {}) };
    const text = JSON.stringify(line);
    if (level === 'error' || level === 'warn') process.stderr.write(text + '\n');
    else process.stdout.write(text + '\n');
  }

  return {
    debug: (msg, extra) => emit('debug', msg, extra),
    info: (msg, extra) => emit('info', msg, extra),
    warn: (msg, extra) => emit('warn', msg, extra),
    error: (msg, extra) => emit('error', msg, extra),
  };
}

module.exports = { makeLogger, LEVELS };
