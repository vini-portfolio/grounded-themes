// Runs the pipeline: embed -> reduce -> cluster -> extract -> label -> project.
// Pure orchestration: the embedding function is injected, every random choice
// comes from the seeded RNG, and each stage reports one typed event.
import * as C from './constants.js';
import { selectClustering, mergeSmallClusters } from './cluster.js';
import { candidateStats, keyphraseName, scoreCandidates, topKeyphrases } from './keyphrases.js';
import { dot, mean, unit } from './linalg.js';
import { pca } from './reduce.js';
import { createRng } from './rng.js';

export const EVENT_VERSION = 1;
export const STAGES = ['embed', 'reduce', 'cluster', 'extract', 'label', 'project'];

const round = (x, p = 6) => Math.round(x * 10 ** p) / 10 ** p;

/**
 * @param {{
 *   texts: string[],
 *   embed: (texts: string[]) => Promise<{ vectors: ArrayLike<number>[], dims: number, truncated?: number, backend?: string }>,
 *   seed?: number,
 *   onStage?: (stage: string) => void,
 *   onEvent?: (event: object) => void,
 *   now?: () => number,
 * }} opts
 */
export async function runPipeline({
  texts,
  embed,
  seed = C.DEFAULT_SEED,
  onStage = () => {},
  onEvent = () => {},
  now = () => performance.now(),
  reducedDimensions = C.REDUCED_DIMENSIONS,
  minNotesPerTheme = C.MIN_NOTES_PER_THEME,
  kTolerance = 0,
}) {
  if (texts.length < 2) throw new RangeError('runPipeline needs at least two notes');
  const rng = createRng(seed);
  const events = [];
  const emit = (stage, started, payload) => {
    const event = { stage, version: EVENT_VERSION, durationMs: round(now() - started, 3), payload };
    events.push(event);
    onEvent(event);
  };

  // Embed
  onStage('embed');
  let t = now();
  const embedded = await embed(texts);
  const vectors = embedded.vectors;
  if (!vectors.every((v) => v.length && Array.prototype.every.call(v, Number.isFinite))) {
    throw new RangeError('embedding produced non-finite values');
  }
  emit('embed', t, {
    count: vectors.length,
    dims: embedded.dims,
    truncated: embedded.truncated ?? 0,
    backend: embedded.backend ?? 'unknown',
  });

  // Reduce
  onStage('reduce');
  t = now();
  // reducedDimensions = null clusters on the full unit vectors (used to compare designs).
  const reduced =
    reducedDimensions === null
      ? { projected: vectors.map((v) => Float64Array.from(v)), explainedVarianceRatio: 1, components: embedded.dims }
      : pca(vectors, reducedDimensions);
  emit('reduce', t, {
    inputDims: embedded.dims,
    outputDims: reduced.components,
    explainedVarianceRatio: round(reduced.explainedVarianceRatio),
  });

  // Cluster
  onStage('cluster');
  t = now();
  const chosen = selectClustering(reduced.projected, rng, {
    kMax: C.K_MAX,
    minNotesPerTheme,
    kTolerance,
    agglomerativeMaxN: C.AGGLOMERATIVE_MAX_N,
    kmeansRuns: C.KMEANS_RUNS,
    kmeansMaxIter: C.KMEANS_MAX_ITER,
  });
  const { labels, merges } = mergeSmallClusters(reduced.projected, chosen.labels, C.MIN_CLUSTER_SIZE);
  const k = Math.max(...labels) + 1;
  emit('cluster', t, {
    kRange: chosen.ks,
    scores: chosen.scores.map((s) => ({ ...s, silhouette: round(s.silhouette) })),
    selected: chosen.selected ? { ...chosen.selected, silhouette: round(chosen.selected.silhouette) } : null,
    agglomerativeSkipped: chosen.skipAgglomerative,
    // Indexes of notes the two algorithms group differently at the selected k,
    // before small themes are merged.
    disagreements: chosen.disagreements,
    merges: merges.map((m) => ({ ...m, similarity: round(m.similarity) })),
    themeCount: k,
    assignments: labels,
  });

  // Extract
  onStage('extract');
  t = now();
  const members = Array.from({ length: k }, (_, c) => labels.flatMap((l, i) => (l === c ? [i] : [])));
  const stats = candidateStats(members.map((idx) => idx.map((i) => texts[i])));
  const phrases = [...new Set(stats.flatMap((rows) => rows.map((r) => r.phrase)))];
  const phraseVectors = new Map();
  if (phrases.length) {
    const pe = await embed(phrases);
    phrases.forEach((p, i) => phraseVectors.set(p, unit(pe.vectors[i])));
  }
  const unitVectors = vectors.map(unit);
  const themes = members.map((idx, c) => {
    const centroid = unit(mean(unitVectors, idx));
    const sims = stats[c].map((r) => dot(phraseVectors.get(r.phrase), centroid));
    const scored = scoreCandidates(stats[c], sims, idx.length);
    const keyphrases = topKeyphrases(scored, C.KEYPHRASES_PER_THEME).map((s) => s.phrase);
    return { index: c, noteIndexes: idx, scored, keyphrases, tfidfApplicable: idx.length >= C.TFIDF_MIN_NOTES };
  });
  emit('extract', t, {
    themes: themes.map((th) => ({
      theme: th.index,
      size: th.noteIndexes.length,
      tfidfApplicable: th.tfidfApplicable,
      candidates: th.scored.slice(0, C.CANDIDATES_SHOWN).map((s) => ({
        phrase: s.phrase,
        similarity: round(s.similarity),
        coverage: round(s.coverage),
        tfidf: s.tfidf === null ? null : round(s.tfidf),
        bigramBoost: s.bigramBoost,
        combined: round(s.combined),
      })),
      keyphrases: th.keyphrases,
    })),
  });

  // Label (interim: keyphrase names until generated labels are added)
  onStage('label');
  t = now();
  const used = new Map();
  for (const th of themes) {
    const base = keyphraseName(th.keyphrases);
    let label = base;
    for (let n = 2; used.has(label); n += 1) label = `${base} ${n}`;
    used.set(label, true);
    th.label = label;
  }
  emit('label', t, {
    themes: themes.map((th) => ({
      theme: th.index,
      label: th.label,
      source: 'keyphrase',
      keyphrases: th.keyphrases,
      attempts: [],
    })),
  });

  // Project to 2-D for the map (its own PCA of the full embeddings, not of
  // the 28-dimension reduction used for clustering).
  onStage('project');
  t = now();
  const projection = pca(vectors, 2);
  const coordinates = projection.projected.map((p) => [round(p[0]), round(p[1] ?? 0)]);
  emit('project', t, { coordinates, explainedVarianceRatio: round(projection.explainedVarianceRatio) });

  return {
    themes: themes.map((th) => ({ label: th.label, keyphrases: th.keyphrases, noteIndexes: th.noteIndexes })),
    assignments: labels,
    coordinates,
    vectors,
    events,
  };
}
