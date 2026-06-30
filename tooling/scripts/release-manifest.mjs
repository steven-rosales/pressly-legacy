import { readFile } from 'node:fs/promises';

const shaPattern = /^[0-9a-f]{40}$/;
const imagePattern = /^ghcr\.io\/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$/;

const assertReleaseManifest = (value, expectedSourceSha) => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !shaPattern.test(value.sourceSha) ||
    !imagePattern.test(value.apiImage) ||
    !imagePattern.test(value.webImage) ||
    typeof value.builtAt !== 'string' ||
    Number.isNaN(Date.parse(value.builtAt))
  ) {
    throw new Error('Release manifest is malformed.');
  }

  if (expectedSourceSha && value.sourceSha !== expectedSourceSha) {
    throw new Error(
      'Release manifest source SHA does not match deployment SHA.',
    );
  }

  return value;
};

export const createReleaseManifest = (input) =>
  assertReleaseManifest({
    sourceSha: input.sourceSha,
    apiImage: input.apiImage,
    webImage: input.webImage,
    builtAt: input.builtAt,
  });

export const readReleaseManifest = async (path, expectedSourceSha) =>
  assertReleaseManifest(
    JSON.parse(await readFile(path, 'utf8')),
    expectedSourceSha,
  );

const main = async () => {
  const [mode, path] = process.argv.slice(2);

  if (mode === 'create') {
    process.stdout.write(
      `${JSON.stringify(
        createReleaseManifest({
          sourceSha: process.env['SOURCE_SHA'],
          apiImage: process.env['API_IMAGE'],
          webImage: process.env['WEB_IMAGE'],
          builtAt: process.env['BUILT_AT'],
        }),
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (mode === 'validate' && path) {
    const manifest = await readReleaseManifest(
      path,
      process.env['EXPECTED_SOURCE_SHA'],
    );
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
    return;
  }

  throw new Error(
    'Usage: release-manifest.mjs create | validate <manifest-path>',
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
