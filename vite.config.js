import { defineConfig } from 'vite';

export default defineConfig({
  // Multi-page app semantics: unknown paths return 404 instead of index.html,
  // matching how the static host serves the build.
  appType: 'mpa',
});
