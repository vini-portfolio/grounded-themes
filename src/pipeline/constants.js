// Pipeline constants: the single source for values that docs and tests cite.
// Changing one is a design decision: update docs/ARCHITECTURE.md with the
// benchmark result that justifies it.

/** Dimensions kept by principal component analysis before clustering. */
export const REDUCED_DIMENSIONS = 28;
/** Largest number of themes considered. */
export const K_MAX = 12;
/** The k range stops at floor(n / MIN_NOTES_PER_THEME). */
export const MIN_NOTES_PER_THEME = 4;
/** Final themes smaller than this are merged into their nearest theme. */
export const MIN_CLUSTER_SIZE = 3;
/** Agglomerative clustering is skipped above this many notes (O(n^2) memory). */
export const AGGLOMERATIVE_MAX_N = 150;
/** Random initializations of spherical k-means; the best run is kept. */
export const KMEANS_RUNS = 30;
/** Maximum k-means iterations per run. */
export const KMEANS_MAX_ITER = 100;
/** Keyphrases passed on to labeling per theme. */
export const KEYPHRASES_PER_THEME = 3;
/** Candidates scored per theme (after a cheap frequency pre-filter). */
export const CANDIDATES_PER_THEME = 12;
/** Candidates shown per theme in the explainer. */
export const CANDIDATES_SHOWN = 5;
/** Themes with fewer notes than this skip the contrastive TF-IDF signal. */
export const TFIDF_MIN_NOTES = 3;
/** Keyphrase signal weights (re-normalized when TF-IDF is not applicable). */
export const KEYPHRASE_WEIGHTS = Object.freeze({ similarity: 0.5, coverage: 0.3, tfidf: 0.2 });
/** Added to the combined score of two-word phrases. */
export const BIGRAM_BOOST = 0.05;
/** Default random seed for a run. */
export const DEFAULT_SEED = 42;
