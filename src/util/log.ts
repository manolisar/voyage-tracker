// Tiny console wrapper. The app has 17 console.* call sites with hand-rolled
// bracketed prefixes ([VoyageStore], [landing], [PortCombobox], …). This
// helper standardizes the prefix and gives us one place to:
//   - silence non-warn/error chatter in production builds (import.meta.env.PROD)
//   - swap to a structured logger later without touching every call site.
//
// Usage:
//   const log = createLogger('VoyageStore');
//   log.warn('save failed', err);
//   log.info('queue depth', n);

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// In production, suppress debug + info to keep DevTools quiet. Errors and
// warnings still go through — those carry signal worth the noise.
const isProd = typeof import.meta !== 'undefined' && !!import.meta.env?.PROD;

const ENABLED: Record<LogLevel, boolean> = {
  debug: !isProd,
  info: !isProd,
  warn: true,
  error: true,
};

export function createLogger(scope: string): Logger {
  const tag = `[${scope}]`;
  return {
    debug: (...args) => { if (ENABLED.debug) console.debug(tag, ...args); },
    info:  (...args) => { if (ENABLED.info)  console.info(tag, ...args); },
    warn:  (...args) => { if (ENABLED.warn)  console.warn(tag, ...args); },
    error: (...args) => { if (ENABLED.error) console.error(tag, ...args); },
  };
}
