import { readFile } from 'node:fs/promises';
import { toolingError } from '../../platform/errors/src/tooling-error.mjs';

const shaPattern = /^[0-9a-f]{40}$/;
const imagePattern = /^(ghcr\.io\/[a-z0-9._/-]+)@sha256:([0-9a-f]{64})$/;
const builtAtPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const imageApplications = Object.freeze({
  apiImage: 'api',
  webImage: 'web',
  workerImage: 'worker',
  processorImage: 'processor',
  controlImage: 'control',
});
const manifestFields = Object.freeze([
  'sourceSha',
  ...Object.keys(imageApplications),
  'builtAt',
]);

const hasExactFields = (value) => {
  const keys = Object.keys(value).sort();
  return (
    keys.length === manifestFields.length &&
    [...manifestFields].sort().every((field, index) => field === keys[index])
  );
};

const isCanonicalBuiltAt = (value) => {
  if (typeof value !== 'string' || !builtAtPattern.test(value)) return false;
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().replace('.000Z', 'Z') === value
  );
};

export const validateReleaseManifest = (value, expectedSourceSha) => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !hasExactFields(value) ||
    !shaPattern.test(value.sourceSha) ||
    !isCanonicalBuiltAt(value.builtAt)
  ) {
    throw toolingError({
      code: 'malformed_release_manifest',
      message: 'Release manifest is malformed.',
    });
  }

  const repositories = new Set();
  const digests = new Set();
  for (const [field, application] of Object.entries(imageApplications)) {
    const match = imagePattern.exec(value[field]);
    const repository = match?.[1];
    const digest = match?.[2];
    const repositoryName = repository?.split('/').at(-1);
    if (
      repository === undefined ||
      digest === undefined ||
      (repositoryName !== application &&
        repositoryName !== `pressly-${application}`)
    )
      throw toolingError({
        code: 'malformed_release_manifest',
        message: 'Release manifest is malformed.',
      });
    repositories.add(repository);
    digests.add(digest);
  }

  if (repositories.size !== 5 || digests.size !== 5)
    throw toolingError({
      code: 'malformed_release_manifest',
      message: 'Release manifest is malformed.',
    });

  if (
    expectedSourceSha !== undefined &&
    (!shaPattern.test(expectedSourceSha) ||
      value.sourceSha !== expectedSourceSha)
  ) {
    throw toolingError({
      code: 'release_manifest_source_mismatch',
      message: 'Release manifest source SHA does not match deployment SHA.',
    });
  }

  return value;
};

export const createReleaseManifest = (input) =>
  validateReleaseManifest({
    sourceSha: input.sourceSha,
    apiImage: input.apiImage,
    webImage: input.webImage,
    workerImage: input.workerImage,
    processorImage: input.processorImage,
    controlImage: input.controlImage,
    builtAt: input.builtAt,
  });

export const readReleaseManifest = async (path, expectedSourceSha) =>
  validateReleaseManifest(
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
          workerImage: process.env['WORKER_IMAGE'],
          processorImage: process.env['PROCESSOR_IMAGE'],
          controlImage: process.env['CONTROL_IMAGE'],
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

  throw toolingError({
    code: 'invalid_release_manifest_arguments',
    message: 'Usage: release-manifest.mjs create | validate <manifest-path>',
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
