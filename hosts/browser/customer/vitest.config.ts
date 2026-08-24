import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const testPath = fileURLToPath(new URL('./test', import.meta.url));
const cellsResultSource = fileURLToPath(
  new URL('../../../platform/cells/src/result.ts', import.meta.url),
);
const timeSource = fileURLToPath(
  new URL('../../../platform/time/src/index.ts', import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': srcPath,
      '@test': testPath,
      '@pressly/cells/result': cellsResultSource,
      '@pressly/time': timeSource,
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
