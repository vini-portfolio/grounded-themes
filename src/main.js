import './styles.css';
import { createEmbedder, detectBackend, EmbeddingError } from './embedding-client.js';
import { parsePastedNotes } from './io/paste.js';
import { nearestNeighbors } from './similarity.js';
import { h, replace } from './ui/dom.js';
import { debug } from './debug.js';
import { notes as sampleNotes } from '../data/sample.json';

const app = document.querySelector('#app');
const workspace = document.querySelector('#workspace');

export function webAssemblySupported() {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  } catch {
    return false;
  }
}

const state = { notes: [], vectors: [], themes: [], events: [], selected: null, cache: true, backend: null };

const STAGE_NAMES = {
  embed: 'Embedding notes',
  reduce: 'Reducing dimensions',
  cluster: 'Clustering into themes',
  extract: 'Extracting keyphrases',
  label: 'Naming themes',
  project: 'Computing note positions',
};
const status = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
const errorBox = h('div', { class: 'error-slot' });
const themesPanel = h('section', { class: 'themes', 'aria-labelledby': 'themes-heading' });
const progressBar = h('progress', { class: 'progress', 'aria-label': 'Finding themes', hidden: true });
const stepText = h('span', { class: 'step', 'aria-hidden': 'true' });
const STAGE_ORDER = Object.keys(STAGE_NAMES);

/** Shows a determinate progress bar (value of max), or hides it when value is null. */
function setProgress(value, max = 1, step = '') {
  progressBar.hidden = value === null;
  if (value !== null) {
    progressBar.max = max;
    progressBar.value = value;
  }
  stepText.textContent = step;
  if (step) progressBar.setAttribute('aria-valuetext', step);
  else progressBar.removeAttribute('aria-valuetext');
}

const progress = new Map();
let lastAnnounced = -1;
const embedder = createEmbedder({
  onProgress: ({ file, loaded, total }) => {
    progress.set(file, { loaded, total });
    let l = 0;
    let t = 0;
    for (const p of progress.values()) {
      l += p.loaded;
      t += p.total;
    }
    // Announce at most every 10%, so screen readers aren't flooded with byte counts.
    const tenth = Math.floor((l / Math.max(t, 1)) * 10);
    if (tenth !== lastAnnounced) {
      lastAnnounced = tenth;
      status.textContent = `Downloading the model: ${(l / 1048576).toFixed(1)} of at least ${(t / 1048576).toFixed(1)} MB`;
    }
    setProgress(l, Math.max(t, l, 1), 'First run only');
  },
});
if (import.meta.env.VITE_FAULT_HOOKS === '1') {
  // Test builds only (stripped from production; checked by scripts/check-dist.mjs).
  window.__gtInjectFault = (kind) => embedder.injectFault(kind);
  window.__gtState = state;
  // Runs the pipeline with another embedding model or design, for comparisons.
  window.__gtExperiment = async (texts, { model, pipelineOptions, backend, seed } = {}) => {
    const t0 = performance.now();
    const events = [];
    const r = await embedder.run(texts, {
      backend: backend ?? (state.backend ??= await detectBackend()),
      modelOverride: model,
      pipelineOptions,
      seed: seed ?? 42,
      onEvent: (e) => events.push(e),
    });
    return {
      ms: Math.round(performance.now() - t0),
      assignments: r.assignments,
      labels: r.themes.map((t) => t.label),
      downloadedBytes: r.downloadedBytes,
      modelId: r.modelId,
      backend: r.backend,
      cluster: events.find((e) => e.stage === 'cluster').payload.selected,
      clusterScores: events.find((e) => e.stage === 'cluster').payload.scores,
      merges: events.find((e) => e.stage === 'cluster').payload.merges.length,
      labelSources: events.find((e) => e.stage === 'label').payload.themes.map((t) => t.source),
      loadMs: r.loadMs,
      stageMs: Object.fromEntries(events.map((e) => [e.stage, e.durationMs])),
    };
  };
}

const input = h('textarea', { id: 'notes-input', rows: '6', 'aria-describedby': 'notes-hint' });
const runButton = h('button', { type: 'button', class: 'secondary', onclick: () => run(runButton) }, ['Find themes']);
// The benchmark's measured download size (docs/benchmarks).
const downloadNotice = h('p', { class: 'download-notice' }, [
  'The first run downloads a 59 MB language model. After that it is saved in this browser, and nothing you paste is uploaded.',
]);
// Loads the demo sample in one click and runs it.
const sampleButton = h(
  'button',
  {
    type: 'button',
    class: 'primary',
    onclick: () => {
      if (running) return;
      input.value = sampleNotes.map((n) => n.text).join('\n');
      run(sampleButton);
    },
  },
  ['Run on the sample'],
);

function showError(error) {
  const kind = error instanceof EmbeddingError ? error.kind : 'unknown';
  const actions = [];
  let message;
  if (kind === 'network') {
    const hosts = error.hosts.length ? error.hosts : ['huggingface.co'];
    message = `The model couldn't be downloaded because ${hosts.join(', ')} ${hosts.length > 1 ? 'are' : 'is'} unreachable from this network. Retry, or try again from a network that allows ${hosts.length > 1 ? 'these hosts' : 'that host'}.`;
    actions.push(h('button', { type: 'button', onclick: () => run() }, ['Retry']));
  } else if (kind === 'quota') {
    message = "There isn't enough browser storage to keep the model for next time.";
    actions.push(
      h('button', { type: 'button', onclick: () => { state.cache = false; run(); } }, ['Run without saving the model']),
    );
  } else if (kind === 'crash' || kind === 'oom' || kind === 'device-lost') {
    const what = { crash: 'The processing worker stopped unexpectedly.', oom: 'The browser ran out of memory.', 'device-lost': 'The graphics device was lost.' }[kind];
    message = `${what} Retrying uses the slower but more robust CPU (WebAssembly) path.`;
    actions.push(h('button', { type: 'button', onclick: () => { state.backend = 'wasm'; run(); } }, ['Retry']));
  } else {
    message = 'Something went wrong while processing the notes.';
    actions.push(h('button', { type: 'button', onclick: () => run() }, ['Retry']));
  }
  console.error('Grounded Themes:', kind, error);
  replace(
    errorBox,
    h('div', { class: 'error', role: 'alert' }, [
      h('p', {}, [message]),
      ...actions,
      h('details', {}, [h('summary', {}, ['Technical details']), h('code', {}, [`${kind}: ${error?.message ?? error}`])]),
    ]),
  );
  status.textContent = '';
  keepFocus(errorBox.querySelector('button'));
}

/** Renders the themes as cards; every note is a button that shows its closest matches. */
function renderThemes() {
  if (!state.themes.length) return replace(themesPanel);
  const ready = state.vectors.length === state.notes.length;
  replace(
    themesPanel,
    h('h2', { id: 'themes-heading', tabindex: '-1' }, ['Themes']),
    h(
      'ol',
      { class: 'theme-list' },
      state.themes.map((theme, t) =>
        h('li', { class: 'theme' }, [
          h('div', { class: 'theme-header' }, [
            h('h3', { id: `theme-${t}` }, [theme.label]),
            h('span', { class: 'count' }, [`${theme.noteIndexes.length} ${theme.noteIndexes.length === 1 ? 'note' : 'notes'}`]),
          ]),
          theme.keyphrases.length
            ? h('ul', { class: 'chips', 'aria-label': 'Keyphrases' }, theme.keyphrases.map((k) => h('li', {}, [k])))
            : null,
          h(
            'ul',
            { class: 'theme-notes', 'aria-labelledby': `theme-${t}` },
            theme.noteIndexes.map((i) =>
              h('li', {}, [
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'note',
                    'data-index': String(i),
                    'aria-expanded': 'false',
                    'aria-controls': `neighbors-${i}`,
                    disabled: !ready,
                    onclick: () => select(i),
                  },
                  [state.notes[i].text],
                ),
                h('div', { class: 'neighbors', id: `neighbors-${i}`, hidden: true }),
              ]),
            ),
          ),
        ]),
      ),
    ),
  );
  // Marks every note as in the page and usable (the benchmark waits for it).
  if (ready) app.dataset.notesRendered = String(state.notes.length);
}

/** Shows (or hides, on a second click) the five notes most similar to note i, right below it. */
function select(i) {
  if (state.vectors.length !== state.notes.length) return; // embeddings not ready for these notes
  const closing = state.selected === i;
  if (state.selected !== null) {
    const prev = themesPanel.querySelector(`button.note[data-index="${state.selected}"]`);
    prev?.setAttribute('aria-expanded', 'false');
    const panel = themesPanel.querySelector(`#neighbors-${state.selected}`);
    if (panel) {
      panel.hidden = true;
      replace(panel);
    }
  }
  state.selected = closing ? null : i;
  if (closing) return;
  themesPanel.querySelector(`button.note[data-index="${i}"]`)?.setAttribute('aria-expanded', 'true');
  const panel = themesPanel.querySelector(`#neighbors-${i}`);
  if (!panel) return;
  const neighbors = nearestNeighbors(state.vectors, i, 5);
  replace(
    panel,
    h('p', { class: 'neighbors-title' }, ['Most similar notes (similarity from 0 to 1)']),
    h(
      'ol',
      { class: 'neighbor-list' },
      neighbors.map((n) =>
        h('li', {}, [
          h('span', { class: 'neighbor-text' }, [state.notes[n.index].text]),
          h('span', { class: 'score' }, [
            h('span', { class: 'visually-hidden' }, ['similarity ']),
            h('span', { class: 'similarity' }, [n.similarity.toFixed(2)]),
          ]),
        ]),
      ),
    ),
  );
  panel.hidden = false;
}

let running = false;
let lastTrigger = null;

/** Marks the run buttons busy without disabling them, so keyboard focus is never lost. */
function setBusy(busy) {
  running = busy;
  for (const b of [runButton, sampleButton]) {
    if (busy) b.setAttribute('aria-disabled', 'true');
    else b.removeAttribute('aria-disabled');
  }
}

/** Moves focus to el if focus would otherwise be lost (on the page body or inside removed content). */
function keepFocus(el, from = null) {
  const active = document.activeElement;
  if (!active || active === document.body || (from && from.contains(active)) || active === runButton || active === sampleButton) {
    el?.focus();
  }
}

async function run(trigger) {
  if (running) return;
  if (trigger) lastTrigger = trigger;
  // Retrying removes the error box; keep keyboard focus on the button that started the run.
  keepFocus(lastTrigger ?? runButton, errorBox);
  replace(errorBox);
  const notes = parsePastedNotes(input.value);
  if (notes.length < 2) {
    status.textContent = 'Add at least two notes, one per line.';
    return;
  }
  state.notes = notes;
  state.vectors = [];
  state.themes = [];
  state.events = [];
  state.selected = null;
  delete app.dataset.embedded;
  delete app.dataset.themes;
  delete app.dataset.notesRendered;
  replace(themesPanel);
  themesPanel.setAttribute('aria-busy', 'true');
  setBusy(true);
  status.textContent = 'Loading the model…';
  setProgress(0, 1, '');
  try {
    state.backend ??= await detectBackend();
    const result = await embedder.run(notes.map((n) => n.text), {
      // Test builds only: benchmarks can try pipeline options through the real interface.
      ...(import.meta.env.VITE_FAULT_HOOKS === '1' ? { pipelineOptions: window.__gtPipelineOptions } : {}),
      backend: state.backend,
      cache: state.cache,
      onStage: (stage) => {
        status.textContent = `${STAGE_NAMES[stage] ?? stage}…`;
        const n = STAGE_ORDER.indexOf(stage);
        if (n >= 0) setProgress(n + 1, STAGE_ORDER.length, `Step ${n + 1} of ${STAGE_ORDER.length}`);
      },
      onEvent: (event) => {
        state.events.push(event);
        debug(`stage ${event.stage} took ${event.durationMs} ms`, event.payload);
      },
    });
    state.vectors = result.vectors;
    state.themes = result.themes;
    renderThemes();
    // Take keyboard and screen-reader users to the results they asked for.
    keepFocus(themesPanel.querySelector('h2'));
    app.dataset.themes = String(result.themes.length);
    app.dataset.backend = result.backend;
    const truncatedNote = result.truncated
      ? ` ${result.truncated} long ${result.truncated === 1 ? 'note was' : 'notes were'} shortened to the model's input limit.`
      : '';
    const themeCount = `${result.themes.length} ${result.themes.length === 1 ? 'theme' : 'themes'}`;
    status.textContent = `${notes.length} notes embedded on this device and grouped into ${themeCount}.${truncatedNote} Select a note to see its closest matches.`;
    if (result.cacheFailed && state.cache) {
      replace(
        errorBox,
        h('div', { class: 'notice', role: 'alert' }, [
          h('p', {}, [
            "There isn't enough browser storage to keep the model, so the next visit will download it again.",
          ]),
          h('button', { type: 'button', onclick: () => { state.cache = false; keepFocus(themesPanel.querySelector('h2'), errorBox); replace(errorBox); } }, [
            'Stop trying to save the model',
          ]),
        ]),
      );
    }
    app.dataset.embedded = String(notes.length);
    downloadNotice.hidden = true;
  } catch (error) {
    // Start a fresh worker after a crash or out-of-memory error: its memory may be corrupt.
    if (error instanceof EmbeddingError && ['crash', 'oom'].includes(error.kind)) embedder.terminate();
    showError(error);
  } finally {
    themesPanel.removeAttribute('aria-busy');
    setProgress(null);
    setBusy(false);
  }
}

if (webAssemblySupported()) {
  replace(
    workspace,
    h('section', { class: 'start', 'aria-labelledby': 'start-heading' }, [
      h('h2', { id: 'start-heading', class: 'visually-hidden' }, ['Choose your notes']),
      h('div', { class: 'choices' }, [
        h('div', { class: 'card' }, [
          h('h3', {}, ['Try the sample']),
          h('p', { class: 'hint' }, [`${sampleNotes.length} notes from a bakery menu brainstorm.`]),
          sampleButton,
        ]),
        h('div', { class: 'card' }, [
          h('h3', {}, ['Use your own notes']),
          h('label', { for: 'notes-input' }, ['Paste notes']),
          h('p', { id: 'notes-hint', class: 'hint' }, ['One note per line, at least two notes.']),
          input,
          runButton,
        ]),
      ]),
      downloadNotice,
    ]),
    h('div', { class: 'progress-area' }, [h('div', { class: 'progress-row' }, [progressBar, stepText]), status]),
    errorBox,
    themesPanel,
  );
  // The download notice only matters until the model is saved in this browser.
  if ('caches' in window) {
    caches
      .has('transformers-cache')
      .then(async (has) => has && (await (await caches.open('transformers-cache')).keys()).length > 0)
      .then((cached) => {
        if (cached) downloadNotice.hidden = true;
      })
      .catch(() => {});
  }
} else {
  replace(
    workspace,
    h('div', { class: 'error', role: 'alert' }, [
      h('p', {}, [
        "This browser doesn't support WebAssembly, which Grounded Themes needs to run models on your device. Try a current version of Chrome, Edge, Firefox or Safari.",
      ]),
    ]),
  );
}
app.dataset.ready = 'true';
