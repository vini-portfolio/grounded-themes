// Minimal DOM builder. Text is always set with textContent, never innerHTML,
// so note text from users or files can't inject markup or script.

/**
 * @param {string} tag
 * @param {Record<string, string | boolean | ((e: Event) => void)>} [attrs]
 * @param {(Node | string | null | undefined | false)[]} [children]
 */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === 'function') el.addEventListener(key.replace(/^on/, ''), value);
    else if (value === true) el.setAttribute(key, '');
    else if (value !== false && value != null) el.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

/** Replaces all children of el. */
export function replace(el, ...children) {
  el.replaceChildren(...children.filter((c) => c != null && c !== false));
}
