import { coldTest as test, embedNotes, expect } from './fixtures.js';
import { EMBEDDING_MODEL } from '../../src/worker/runtime-config.js';

const MODEL_HOSTS = [/^huggingface\.co$/, /(^|\.)hf\.co$/, /(^|\.)huggingface\.co$/];
const MARKER = 'zebra-quokka-7731';

test.describe('@privacy network behavior', () => {
  test('loads code only from this site, models only from the model host, and never sends note text', async ({
    page,
    context,
    baseURL,
  }) => {
    const origin = new URL(baseURL).origin;
    const requests = [];
    context.on('request', (r) => requests.push(r));
    await page.goto('/');
    const notes = [
      `${MARKER} the export button is hidden in settings`,
      `${MARKER} I want to download my data as a spreadsheet`,
      `${MARKER} onboarding emails arrive too often`,
    ];
    await embedNotes(page, notes);

    const offSite = [];
    for (const r of requests) {
      const url = new URL(r.url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') continue;
      const isCode = ['script', 'worker'].includes(r.resourceType()) || /\.(m?js|wasm)$/.test(url.pathname);
      if (url.origin !== origin) {
        offSite.push(url);
        expect(isCode && !/\.(onnx|json|txt)$/.test(url.pathname), `code from ${url.href}`).toBe(false);
        expect(MODEL_HOSTS.some((rx) => rx.test(url.host)), `unexpected host ${url.host}`).toBe(true);
      }
      expect(r.url().includes(MARKER), `note text in URL ${r.url()}`).toBe(false);
      expect((r.postData() ?? '').includes(MARKER), `note text in body of ${r.url()}`).toBe(false);
    }
    expect(offSite.length).toBeGreaterThan(0); // the cold run really downloaded the model
    for (const url of offSite) {
      if (url.host === 'huggingface.co') {
        // Every request to the hub names the pinned revision, never a branch.
        expect(url.pathname, `unpinned request ${url.href}`).toContain(
          `/${EMBEDDING_MODEL.id}/resolve/${EMBEDDING_MODEL.revision}/`,
        );
      }
    }
    const ortRequests = requests.filter((r) => r.url().includes('ort-wasm-simd-threaded'));
    expect(ortRequests.length).toBeGreaterThan(0);
    for (const r of ortRequests) expect(new URL(r.url()).origin).toBe(origin);
  });

  test('reuses cached model files on the next visit', async ({ page, context }) => {
    await page.goto('/');
    await embedNotes(page, ['first note about billing', 'second note about invoices']);
    const later = [];
    context.on('request', (r) => {
      if (!r.url().startsWith(new URL(page.url()).origin)) later.push(r.url());
    });
    await page.reload();
    await embedNotes(page, ['third note about refunds', 'fourth note about receipts']);
    expect(later).toEqual([]);
  });
});
