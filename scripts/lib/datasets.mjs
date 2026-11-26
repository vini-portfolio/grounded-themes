// Rules for the datasets in data/ (used by check-data.mjs and unit tests).

export const DATASET_RULES = {
  sample: { min: 40, max: 60, themes: [4, 8], domains: 1, noisyShare: 0 },
  test: { min: 12, max: 20, themes: [3, 6], domains: 1, noisyShare: 0 },
  stress: { min: 151, max: 500, themes: [10, 20], domains: 3, noisyShare: 0.2 },
};

const AUTHOR = /^P\d+$/;

/**
 * @param {{ name: string, notes: Array<Record<string, unknown>> }} data
 * @param {{ min: number, max: number, themes: [number, number], domains: number, noisyShare: number }} rules
 * @returns {string[]} problems
 */
export function checkDataset(data, rules) {
  const problems = [];
  const notes = Array.isArray(data?.notes) ? data.notes : [];
  if (!data?.name) problems.push('missing name');
  if (notes.length < rules.min || notes.length > rules.max) {
    problems.push(`note count ${notes.length} outside ${rules.min}–${rules.max}`);
  }
  const ids = new Set();
  const texts = new Set();
  for (const n of notes) {
    for (const field of ['id', 'text', 'theme', 'domain', 'author']) {
      if (typeof n[field] !== 'string' || n[field].trim() === '') problems.push(`${n.id ?? '?'}: missing ${field}`);
    }
    if (typeof n.noisy !== 'boolean') problems.push(`${n.id}: noisy must be true or false`);
    if (typeof n.author === 'string' && !AUTHOR.test(n.author)) problems.push(`${n.id}: author must be a placeholder like P1`);
    if (ids.has(n.id)) problems.push(`duplicate id ${n.id}`);
    ids.add(n.id);
    const key = String(n.text).trim().toLowerCase();
    if (texts.has(key)) problems.push(`duplicate text in ${n.id}`);
    texts.add(key);
  }
  const themes = new Set(notes.map((n) => n.theme));
  if (themes.size < rules.themes[0] || themes.size > rules.themes[1]) {
    problems.push(`${themes.size} themes outside ${rules.themes[0]}–${rules.themes[1]}`);
  }
  const domains = new Set(notes.map((n) => n.domain));
  if (domains.size < rules.domains) problems.push(`${domains.size} subject areas, need at least ${rules.domains}`);
  const noisy = notes.filter((n) => n.noisy).length;
  if (notes.length && noisy / notes.length < rules.noisyShare) {
    problems.push(`noisy share ${(noisy / notes.length).toFixed(2)} below ${rules.noisyShare}`);
  }
  return problems;
}
