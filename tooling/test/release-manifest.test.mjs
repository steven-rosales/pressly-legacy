import { expect, test } from 'vitest';
import { createReleaseManifest } from '../scripts/release-manifest.mjs';

const sha = 'a'.repeat(40);
const digest = 'b'.repeat(64);

test('creates a release manifest from immutable image references', () => {
  expect(
    createReleaseManifest({
      sourceSha: sha,
      apiImage: `ghcr.io/pressly/pressly-api@sha256:${digest}`,
      webImage: `ghcr.io/pressly/pressly-web@sha256:${digest}`,
      builtAt: '2026-06-29T12:00:00Z',
    }),
  ).toEqual({
    sourceSha: sha,
    apiImage: `ghcr.io/pressly/pressly-api@sha256:${digest}`,
    webImage: `ghcr.io/pressly/pressly-web@sha256:${digest}`,
    builtAt: '2026-06-29T12:00:00Z',
  });
});

test('rejects mutable image tags', () => {
  expect(() =>
    createReleaseManifest({
      sourceSha: sha,
      apiImage: 'ghcr.io/pressly/pressly-api:latest',
      webImage: `ghcr.io/pressly/pressly-web@sha256:${digest}`,
      builtAt: '2026-06-29T12:00:00Z',
    }),
  ).toThrow(/malformed/);
});

test('rejects abbreviated source SHAs', () => {
  expect(() =>
    createReleaseManifest({
      sourceSha: 'abc123',
      apiImage: `ghcr.io/pressly/pressly-api@sha256:${digest}`,
      webImage: `ghcr.io/pressly/pressly-web@sha256:${digest}`,
      builtAt: '2026-06-29T12:00:00Z',
    }),
  ).toThrow(/malformed/);
});
