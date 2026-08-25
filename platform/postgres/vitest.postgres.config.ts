import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.int.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 60_000,
  },
});
