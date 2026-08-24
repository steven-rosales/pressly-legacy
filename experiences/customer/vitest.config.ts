import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^#customer\/(.*)$/,
        replacement: `${fileURLToPath(new URL('./src/web', import.meta.url))}/$1`,
      },
      {
        find: /^@test\/(.*)$/,
        replacement: `${fileURLToPath(new URL('./test/web', import.meta.url))}/$1`,
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
      'test/**/*.test.ts',
      'test/**/*.test.tsx',
    ],
    maxWorkers: 2,
  },
});
