import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { runPipeline, STAGES } from '../../src/pipeline/index.js';
import { bowEmbed } from './helpers/bow-embed.js';

const schema = JSON.parse(readFileSync(new URL('../../src/pipeline/events.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const load = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}.json`, import.meta.url), 'utf8'));
const texts = (name) => load(name).notes.map((n) => n.text);
let tick = 0;
const now = () => (tick += 1);

describe('pipeline', () => {
  it('emits exactly one schema-valid event per stage on the test set', async () => {
    const events = [];
    const stages = [];
    await runPipeline({ texts: texts('test'), embed: bowEmbed, seed: 7, onEvent: (e) => events.push(e), onStage: (s) => stages.push(s), now });
    expect(events.map((e) => e.stage)).toEqual(STAGES);
    expect(stages).toEqual(STAGES);
    for (const e of events) {
      const ok = validate(e);
      expect(ok, JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it('is deterministic for the same input and seed', async () => {
    const a = await runPipeline({ texts: texts('test'), embed: bowEmbed, seed: 7, now });
    const b = await runPipeline({ texts: texts('test'), embed: bowEmbed, seed: 7, now });
    expect(a.assignments).toEqual(b.assignments);
    expect(a.themes).toEqual(b.themes);
  });

  it('gives the same results with or without an event listener', async () => {
    const withEvents = await runPipeline({ texts: texts('test'), embed: bowEmbed, seed: 7, onEvent: () => {}, now });
    const without = await runPipeline({ texts: texts('test'), embed: bowEmbed, seed: 7, now });
    expect(withEvents.assignments).toEqual(without.assignments);
    expect(withEvents.themes).toEqual(without.themes);
  });

  it('keeps every final theme at or above the minimum size and passes top keyphrases to labeling', async () => {
    const res = await runPipeline({ texts: texts('sample'), embed: bowEmbed, seed: 7, now });
    for (const th of res.themes) expect(th.noteIndexes.length).toBeGreaterThanOrEqual(3);
    const extract = res.events.find((e) => e.stage === 'extract').payload;
    const label = res.events.find((e) => e.stage === 'label').payload;
    for (const th of extract.themes) expect(th.keyphrases.length).toBeLessThanOrEqual(3);
    label.themes.forEach((t, i) => expect(res.themes[i].label).toBe(t.label));
    expect(res.coordinates).toHaveLength(50);
  });

  it('skips agglomerative clustering on the stress set', async () => {
    const res = await runPipeline({ texts: texts('stress'), embed: bowEmbed, seed: 7, now });
    const cluster = res.events.find((e) => e.stage === 'cluster').payload;
    expect(cluster.agglomerativeSkipped).toBe(true);
    expect(cluster.scores.every((s) => s.algorithm === 'kmeans')).toBe(true);
  }, 30_000);
});
