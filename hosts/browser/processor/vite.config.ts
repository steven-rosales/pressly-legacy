import path from 'node:path';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Source maps are generated only when the build can upload and remove them.
// This keeps production stack traces useful without serving source maps publicly.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const release = env['SENTRY_RELEASE'] ?? env['VITE_SENTRY_RELEASE'];
  const hasValue = (value: string | undefined): value is string =>
    value !== undefined && value.trim().length > 0;
  const sentryUploadEnabled =
    hasValue(env['SENTRY_AUTH_TOKEN']) &&
    hasValue(env['SENTRY_ORG']) &&
    hasValue(env['SENTRY_PROJECT']) &&
    hasValue(env['VITE_SENTRY_DSN']) &&
    hasValue(release);

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(sentryUploadEnabled
        ? [
            sentryVitePlugin({
              authToken: env['SENTRY_AUTH_TOKEN'],
              org: env['SENTRY_ORG'],
              project: env['SENTRY_PROJECT'],
              release: { name: release },
              sourcemaps: { filesToDeleteAfterUpload: './dist/**/*.map' },
              errorHandler: (error) => {
                throw error;
              },
              silent: env['CI'] !== 'true',
              telemetry: false,
            }),
          ]
        : []),
    ],
    ...(release === undefined
      ? {}
      : {
          define: {
            'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(release),
          },
        }),
    build: { sourcemap: sentryUploadEnabled ? 'hidden' : false },
    server: {
      port: 4173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: false,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      css: true,
      testTimeout: 15_000,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  };
});
