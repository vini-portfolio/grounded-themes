import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  // Multi-page app semantics: unknown paths return 404 instead of index.html,
  // matching how the static host serves the build.
  appType: 'mpa',
  resolve: {
    // Use ONNX Runtime's build that loads its WebAssembly from a configured
    // path (public/ort) instead of bundling a second copy into assets/.
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
  worker: { format: 'es' },
});
