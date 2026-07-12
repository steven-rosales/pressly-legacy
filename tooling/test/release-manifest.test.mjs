import { expect, test } from 'vitest';
import {
  createReleaseManifest,
  validateReleaseManifest,
} from '../scripts/release-manifest.mjs';

const sha = 'a'.repeat(40);
const immutableImages = {
  apiImage: `ghcr.io/pressly/pressly-api@sha256:${'b'.repeat(64)}`,
  webImage: `ghcr.io/pressly/pressly-web@sha256:${'c'.repeat(64)}`,
  workerImage: `ghcr.io/pressly/pressly-worker@sha256:${'d'.repeat(64)}`,
  processorImage: `ghcr.io/pressly/pressly-processor@sha256:${'e'.repeat(64)}`,
};
const validManifest = {
  sourceSha: sha,
  ...immutableImages,
  builtAt: '2026-06-29T12:00:00Z',
};

test('creates a release manifest from immutable image references', () => {
  expect(createReleaseManifest(validManifest)).toEqual(validManifest);
});

test('rejects mutable image tags', () => {
  expect(() =>
    createReleaseManifest({
      ...validManifest,
      apiImage: 'ghcr.io/pressly/pressly-api:latest',
    }),
  ).toThrow(/malformed/);
});

test('rejects abbreviated source SHAs', () => {
  expect(() =>
    createReleaseManifest({
      ...validManifest,
      sourceSha: 'abc123',
    }),
  ).toThrow(/malformed/);
});

test.each(['apiImage', 'webImage', 'workerImage', 'processorImage'])(
  'rejects a manifest missing %s',
  (field) => {
    const input = { ...validManifest };
    delete input[field];

    expect(() => createReleaseManifest(input)).toThrow(/malformed/);
  },
);

test.each(['apiImage', 'webImage', 'workerImage', 'processorImage'])(
  'rejects a malformed digest in %s',
  (field) => {
    expect(() =>
      createReleaseManifest({
        ...validManifest,
        [field]: validManifest[field].slice(0, -1),
      }),
    ).toThrow(/malformed/);
  },
);

test('rejects application images assigned to the wrong manifest field', () => {
  expect(() =>
    createReleaseManifest({
      ...validManifest,
      workerImage: immutableImages.apiImage,
    }),
  ).toThrow(/malformed/);
});

test('rejects different application repositories sharing one digest', () => {
  const apiDigest = immutableImages.apiImage.split('@')[1];
  expect(() =>
    createReleaseManifest({
      ...validManifest,
      workerImage: `ghcr.io/pressly/pressly-worker@${apiDigest}`,
    }),
  ).toThrow(/malformed/);
});

test('rejects extra fields beyond the four-image schema', () => {
  expect(() =>
    validateReleaseManifest({
      ...validManifest,
      adminImage: `ghcr.io/pressly/admin@sha256:${'f'.repeat(64)}`,
    }),
  ).toThrow(/malformed/);
});

test.each([
  '2026-06-29',
  '2026-06-29T12:00:00.000Z',
  '2026-06-29T12:00:00+00:00',
  '2026-02-30T12:00:00Z',
  '2026-99-29T12:00:00Z',
])('rejects non-canonical build timestamp %s', (builtAt) => {
  expect(() => createReleaseManifest({ ...validManifest, builtAt })).toThrow(
    /malformed/,
  );
});

test('binds validation to the expected full source SHA', () => {
  expect(validateReleaseManifest(validManifest, sha)).toEqual(validManifest);
  expect(() => validateReleaseManifest(validManifest, 'f'.repeat(40))).toThrow(
    /does not match/,
  );
  expect(() => validateReleaseManifest(validManifest, 'abc123')).toThrow(
    /does not match/,
  );
});
