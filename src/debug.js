// Development diagnostics. Silent in production builds unless the page URL
// contains ?debug=1; warnings and errors always go to the console.

const enabled =
  import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1');

/** Logs only when diagnostics are enabled. */
export function debug(...args) {
  // eslint-disable-next-line no-console
  if (enabled) console.log('[grounded-themes]', ...args);
}
