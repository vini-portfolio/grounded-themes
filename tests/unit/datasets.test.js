import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDataset, DATASET_RULES } from '../../scripts/lib/datasets.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}.json`, import.meta.url), 'utf8'));

describe('datasets', () => {
  for (const [name, rules] of Object.entries(DATASET_RULES)) {
    it(`${name}.json meets its rules`, () => {
      expect(checkDataset(load(name), rules)).toEqual([]);
    });
  }

  it('shares no note text across datasets', () => {
    const all = Object.keys(DATASET_RULES).flatMap((n) => load(n).notes.map((x) => x.text.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
  });

  it('flags broken datasets', () => {
    const bad = {
      name: 'x',
      notes: [
        { id: 'a', text: 'one', theme: 't', domain: 'd', author: 'Jane', noisy: false },
        { id: 'a', text: 'ONE', theme: 't', domain: 'd', author: 'P1' },
      ],
    };
    const problems = checkDataset(bad, DATASET_RULES.test);
    expect(problems.join('\n')).toMatch(/note count/);
    expect(problems.join('\n')).toMatch(/duplicate id a/);
    expect(problems.join('\n')).toMatch(/duplicate text/);
    expect(problems.join('\n')).toMatch(/placeholder/);
    expect(problems.join('\n')).toMatch(/noisy must be/);
  });
});
