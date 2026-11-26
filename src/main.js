import './styles.css';
import { createEmbedder, detectBackend, EmbeddingError } from './embedding-client.js';
import { parsePastedNotes } from './io/paste.js';
import { nearestNeighbors } from './similarity.js';
import { h, replace } from './ui/dom.js';

const app = document.querySelector('#app');
const workspace = document.querySelector('#workspace');

export function webAssemblySupported() {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  } catch {
    return false;
  }
}

const state = { notes: [], vectors: [], selected: null, cache: true, backend: null };
const status = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
const errorBox = h('div', { class: 'error-slot' });
const notesList = h('ol', { class: 'notes', 'aria-label': 'Notes' });
const neighborsPanel = h('section', { class: 'neighbors', 'aria-label': 'Most similar notes' });

const progress = new Map();
const embedder = createEmbedder({
  onProgress: ({ file, loaded, total }) => {
    progress.set(file, { loaded, total });
    let l = 0;
    let t = 0;
    for (const p of progress.values()) {
      l += p.loaded;
      t += p.total;
    }
    status.textContent = `Downloading the model: ${(l / 1048576).toFixed(1)} of at least ${(t / 1048576).toFixed(1)} MB`;
  },
});
if (import.meta.env.VITE_FAULT_HOOKS === '1') {
  // Test builds only (stripped from production; checked by scripts/check-dist.mjs).
  window.__gtInjectFault = (kind) => embedder.injectFault(kind);
  window.__gtState = state;
}

const input = h('textarea', { id: 'notes-input', rows: '8', placeholder: 'One note per line' });
const runButton = h('button', { type: 'button', onclick: () => run() }, ['Find similar notes']);

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
}

function renderNotes() {
  replace(
    notesList,
    ...state.notes.map((note, i) =>
      h('li', {}, [
        h(
          'button',
          {
            type: 'button',
            class: 'note',
            'aria-pressed': String(state.selected === i),
            disabled: state.vectors.length !== state.notes.length,
            onclick: () => select(i),
          },
          [note.text],
        ),
      ]),
    ),
  );
}

function select(i) {
  if (state.vectors.length !== state.notes.length) return; // embeddings not ready for these notes
  state.selected = i;
  renderNotes();
  const neighbors = nearestNeighbors(state.vectors, i, 5);
  replace(
    neighborsPanel,
    h('h2', {}, ['Most similar notes']),
    h('p', { class: 'selected-note' }, [state.notes[i].text]),
    h(
      'ol',
      { class: 'neighbor-list' },
      neighbors.map((n) =>
        h('li', {}, [h('span', { class: 'similarity' }, [n.similarity.toFixed(2)]), ' ', state.notes[n.index].text]),
      ),
    ),
  );
}

async function run() {
  replace(errorBox);
  const notes = parsePastedNotes(input.value);
  if (notes.length < 2) {
    status.textContent = 'Add at least two notes, one per line.';
    return;
  }
  state.notes = notes;
  state.vectors = [];
  state.selected = null;
  delete app.dataset.embedded;
  replace(neighborsPanel);
  renderNotes();
  runButton.disabled = true;
  status.textContent = 'Loading the model…';
  try {
    state.backend ??= await detectBackend();
    const result = await embedder.embed(notes.map((n) => n.text), { backend: state.backend, cache: state.cache });
    state.vectors = result.vectors;
    renderNotes();
    app.dataset.backend = result.backend;
    const truncatedNote = result.truncated
      ? ` ${result.truncated} long ${result.truncated === 1 ? 'note was' : 'notes were'} shortened to the model's input limit.`
      : '';
    status.textContent = `${notes.length} notes embedded on this device.${truncatedNote} Select a note to see its closest matches.`;
    if (result.cacheFailed && state.cache) {
      replace(
        errorBox,
        h('div', { class: 'notice', role: 'alert' }, [
          h('p', {}, [
            "There isn't enough browser storage to keep the model, so the next visit will download it again.",
          ]),
          h('button', { type: 'button', onclick: () => { state.cache = false; replace(errorBox); } }, [
            'Stop trying to save the model',
          ]),
        ]),
      );
    }
    app.dataset.embedded = String(notes.length);
  } catch (error) {
    // Start a fresh worker after a crash or out-of-memory error: its memory may be corrupt.
    if (error instanceof EmbeddingError && ['crash', 'oom'].includes(error.kind)) embedder.terminate();
    showError(error);
  } finally {
    runButton.disabled = false;
  }
}

if (webAssemblySupported()) {
  replace(
    workspace,
    h('label', { for: 'notes-input' }, ['Paste notes']),
    input,
    h('div', { class: 'actions' }, [runButton]),
    status,
    errorBox,
    notesList,
    neighborsPanel,
  );
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
