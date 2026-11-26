// Keyphrase extraction: unigram and bigram candidates per theme, scored by
// similarity to the theme centroid, coverage of the theme's notes, contrastive
// TF-IDF across themes, and a small boost for two-word phrases.
import {
  BIGRAM_BOOST,
  CANDIDATES_PER_THEME,
  KEYPHRASE_WEIGHTS,
  TFIDF_MIN_NOTES,
} from './constants.js';

export const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both
  but by can could did do does doing down during each even ever every few for from further get gets got had has have
  having he her here hers herself him himself his how i if in into is it its itself just let lets like make makes maybe
  me more most much must my myself need needs no nor not now of off on once one only or other our ours ourselves out
  over own really same she should so some still such than that the their theirs them themselves then there these they
  this those through to too try under until up us very was we were what when where which while who whom why will with
  would yet you your yours yourself yourselves isnt dont didnt doesnt cant wont im ive its thats theres whats lot lots
  thing things way back again new next us via etc ok okay tried try took take asked ask said says came come
  went go goes going keep keeps kept always never per across want wants wanted know think thinking idea using use used
  around another anything everyone people time times day days week weeks today yesterday`.split(/\s+/),
);

/** Lowercase word tokens (letters, digits, inner apostrophes and hyphens). */
export function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) ?? []).map((t) => t.replace(/['’]/g, ''));
}

const isContent = (t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t);

/** Distinct unigram and bigram candidates of one note. */
export function candidatesOf(text) {
  const toks = tokenize(text);
  const out = new Set();
  for (let i = 0; i < toks.length; i += 1) {
    if (isContent(toks[i])) out.add(toks[i]);
    if (i + 1 < toks.length && isContent(toks[i]) && isContent(toks[i + 1])) out.add(`${toks[i]} ${toks[i + 1]}`);
  }
  return out;
}

/**
 * Coverage and contrastive TF-IDF of every candidate in every theme, plus a
 * short list per theme for the (more expensive) similarity scoring.
 * @param {string[][]} themeTexts note texts per theme
 */
export function candidateStats(themeTexts) {
  const T = themeTexts.length;
  const perTheme = themeTexts.map((texts) => {
    const counts = new Map();
    for (const text of texts) for (const c of candidatesOf(text)) counts.set(c, (counts.get(c) ?? 0) + 1);
    return counts;
  });
  const themesWith = new Map();
  for (const counts of perTheme) for (const c of counts.keys()) themesWith.set(c, (themesWith.get(c) ?? 0) + 1);
  return perTheme.map((counts, t) => {
    const size = themeTexts[t].length;
    const rows = [...counts.entries()].map(([phrase, notes]) => {
      const coverage = notes / size;
      const idf = Math.log((1 + T) / (1 + themesWith.get(phrase))) + 1;
      return { phrase, notes, coverage, tfidf: coverage * idf };
    });
    // Pre-filter: phrases in more than one note first, then by TF-IDF.
    rows.sort((a, b) => b.tfidf - a.tfidf || b.notes - a.notes || a.phrase.localeCompare(b.phrase));
    return rows.slice(0, CANDIDATES_PER_THEME);
  });
}

/**
 * Combines the signals into one score per candidate.
 * @param {{ phrase: string, coverage: number, tfidf: number }[]} rows one theme's candidates
 * @param {number[]} similarities cosine similarity of each candidate to the theme centroid
 * @param {number} themeSize notes in the theme
 */
export function scoreCandidates(rows, similarities, themeSize) {
  const useTfidf = themeSize >= TFIDF_MIN_NOTES;
  const maxTfidf = Math.max(...rows.map((r) => r.tfidf), 0) || 1;
  const w = KEYPHRASE_WEIGHTS;
  const wsum = w.similarity + w.coverage + (useTfidf ? w.tfidf : 0);
  return rows
    .map((r, i) => {
      const tfidf = useTfidf ? r.tfidf / maxTfidf : null;
      const bigram = r.phrase.includes(' ') ? BIGRAM_BOOST : 0;
      const combined =
        (w.similarity * similarities[i] + w.coverage * r.coverage + (useTfidf ? w.tfidf * tfidf : 0)) / wsum + bigram;
      return { phrase: r.phrase, similarity: similarities[i], coverage: r.coverage, tfidf, bigramBoost: bigram, combined };
    })
    .sort((a, b) => b.combined - a.combined || a.phrase.localeCompare(b.phrase));
}

/** True when two words are the same word, allowing for a plural ("cookie"/"cookies", "berry"/"berries", "box"/"boxes"). */
export function sameWord(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    long === `${short}s` ||
    long === `${short}es` ||
    (short.endsWith('y') && long === `${short.slice(0, -1)}ies`)
  );
}

/** Top n phrases, skipping a phrase whose words all appear (allowing plurals) in one already chosen, or vice versa. */
export function topKeyphrases(scored, n) {
  const chosen = [];
  for (const s of scored) {
    const words = s.phrase.split(' ');
    const redundant = chosen.some((c) => {
      const cw = c.phrase.split(' ');
      const inside = (xs, ys) => xs.every((x) => ys.some((y) => sameWord(x, y)));
      return inside(words, cw) || inside(cw, words);
    });
    if (!redundant) chosen.push(s);
    if (chosen.length === n) break;
  }
  return chosen;
}

/** Interim theme name from its keyphrases: "Keyphrase one and keyphrase two". */
export function keyphraseName(phrases) {
  const ps = phrases.slice(0, 2);
  if (!ps.length) return 'Untitled theme';
  const text = ps.length === 2 ? `${ps[0]} and ${ps[1]}` : ps[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
}
