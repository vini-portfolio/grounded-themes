// Classifies failures from model loading or inference into the kinds the UI
// explains. Pure: no DOM, no worker globals.

/** @typedef {'network' | 'quota' | 'oom' | 'device-lost' | 'crash' | 'unknown'} FailureKind */

/**
 * @param {unknown} error
 * @returns {FailureKind}
 */
export function classifyError(error) {
  const name = /** @type {any} */ (error)?.name ?? '';
  const message = String(/** @type {any} */ (error)?.message ?? error ?? '').toLowerCase();
  if (name === 'QuotaExceededError' || message.includes('quota')) return 'quota';
  if (message.includes('device lost') || message.includes('device was lost') || name === 'GPUDeviceLostError') {
    return 'device-lost';
  }
  if (
    (name === 'RangeError' && message.includes('memory')) ||
    message.includes('out of memory') ||
    message.includes('memory access out of bounds') ||
    message.includes('cannot enlarge memory')
  ) {
    return 'oom';
  }
  if (name === 'TypeError' && (message.includes('fetch') || message.includes('network') || message.includes('load failed'))) {
    return 'network';
  }
  if (message.includes('failed to fetch') || message.includes('networkerror')) return 'network';
  return 'unknown';
}
