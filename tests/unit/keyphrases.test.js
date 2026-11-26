import { describe, expect, it } from 'vitest';
import { BIGRAM_BOOST, KEYPHRASE_WEIGHTS } from '../../src/pipeline/constants.js';
import { candidatesOf, candidateStats, keyphraseName, scoreCandidates, tokenize, topKeyphrases } from '../../src/pipeline/keyphrases.js';

describe('keyphrase candidates', () => {
  it('extracts unigrams and bigrams without stopwords', () => {
    const c = candidatesOf('The sourdough loaf has a waitlist on Fridays');
    expect([...c].sort()).toEqual(['fridays', 'loaf', 'sourdough', 'sourdough loaf', 'waitlist'].sort());
    expect([...candidatesOf('the and of a to')]).toEqual([]);
    expect(tokenize("didn't rise")).toEqual(['didnt', 'rise']);
    expect(tokenize('Café crème brûlée')).toEqual(['café', 'crème', 'brûlée']);
    expect(tokenize('Cafe\u0301')).toEqual(['café']); // decomposed accent
    // No bigram across sentence punctuation.
    expect(candidatesOf('Great croissant. Butter prices up').has('croissant butter')).toBe(false);
  });

  it('computes coverage and contrastive TF-IDF per theme', () => {
    const stats = candidateStats([
      ['croissant butter margin', 'butter prices up', 'croissant sells out'],
      ['pumpkin loaf october', 'pumpkin spice latte'],
    ]);
    const butter = stats[0].find((r) => r.phrase === 'butter');
    expect(butter.coverage).toBeCloseTo(2 / 3, 10);
    const pumpkin = stats[1].find((r) => r.phrase === 'pumpkin');
    expect(pumpkin.coverage).toBe(1);
    expect(pumpkin.tfidf).toBeGreaterThan(0);
  });
});

describe('keyphrase scoring', () => {
  const rows = [
    { phrase: 'butter', coverage: 0.5, tfidf: 0.6 },
    { phrase: 'butter prices', coverage: 0.25, tfidf: 0.4 },
    { phrase: 'margin', coverage: 0.25, tfidf: 0.2 },
  ];

  it('combines similarity, coverage, TF-IDF and the bigram boost (stored expected values)', () => {
    const scored = scoreCandidates(rows, [0.8, 0.7, 0.3], 4);
    expect(KEYPHRASE_WEIGHTS).toEqual({ similarity: 0.5, coverage: 0.3, tfidf: 0.2 });
    expect(BIGRAM_BOOST).toBe(0.05);
    // butter: 0.5*0.8 + 0.3*0.5 + 0.2*(0.6/0.6) = 0.75
    // butter prices: 0.5*0.7 + 0.3*0.25 + 0.2*(0.4/0.6) + 0.05 = 0.608333…
    // margin: 0.5*0.3 + 0.3*0.25 + 0.2*(0.2/0.6) = 0.291666…
    expect(scored.map((s) => s.phrase)).toEqual(['butter', 'butter prices', 'margin']);
    expect(scored[0].combined).toBeCloseTo(0.75, 10);
    expect(scored[1].combined).toBeCloseTo(0.6083333333, 9);
    expect(scored[2].combined).toBeCloseTo(0.2916666667, 9);
    expect(scored[1].bigramBoost).toBe(0.05);
    expect(scored[0].bigramBoost).toBe(0);
  });

  it('omits TF-IDF for themes under three notes', () => {
    const scored = scoreCandidates(rows, [0.8, 0.7, 0.3], 2);
    const w = KEYPHRASE_WEIGHTS;
    const top = scored.find((s) => s.phrase === 'butter');
    expect(top.tfidf).toBeNull();
    expect(top.combined).toBeCloseTo((w.similarity * 0.8 + w.coverage * 0.5) / (w.similarity + w.coverage), 10);
  });

  it('picks the top three, skipping phrases contained in a chosen one', () => {
    const scored = [
      { phrase: 'butter prices', combined: 0.9 },
      { phrase: 'butter', combined: 0.8 },
      { phrase: 'margin', combined: 0.7 },
      { phrase: 'croissant', combined: 0.6 },
    ];
    expect(topKeyphrases(scored, 3).map((s) => s.phrase)).toEqual(['butter prices', 'margin', 'croissant']);
    const plural = [
      { phrase: 'cookies', combined: 0.9 },
      { phrase: 'cookie', combined: 0.8 },
      { phrase: 'berries', combined: 0.7 },
      { phrase: 'berry tart', combined: 0.6 },
      { phrase: 'boxes', combined: 0.5 },
    ];
    expect(topKeyphrases(plural, 3).map((s) => s.phrase)).toEqual(['cookies', 'berries', 'boxes']);
  });

  it('names a theme from its first two keyphrases in sentence case', () => {
    expect(keyphraseName(['butter prices', 'margin', 'x'])).toBe('Butter prices and margin');
    expect(keyphraseName(['pumpkin'])).toBe('Pumpkin');
    expect(keyphraseName([])).toBe('Untitled theme');
  });
});
