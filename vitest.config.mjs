import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'benchmarks/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'site', 'document-site'],
  },
});
