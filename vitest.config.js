import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/pipeline/**/*.js'],
      reporter: ['text', 'json-summary'],
    },
  },
});
