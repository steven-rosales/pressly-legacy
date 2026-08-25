import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.int.spec.ts'],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
