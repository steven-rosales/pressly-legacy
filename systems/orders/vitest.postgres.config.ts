import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./src/testing/postgres.global-setup.spec-support.ts'],
    include: ['src/**/*.int.spec.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      seed: 780,
      shuffle: { files: true },
    },
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
