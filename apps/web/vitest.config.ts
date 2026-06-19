import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));
const kernelSource = fileURLToPath(
  new URL('../../packages/kernel/src/index.ts', import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': srcPath,
      '@pressly/kernel': kernelSource,
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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
