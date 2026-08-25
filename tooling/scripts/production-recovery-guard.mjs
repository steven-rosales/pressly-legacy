#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const adjacentErrorFactory = new URL('./tooling-error.mjs', import.meta.url);
const repositoryErrorFactory = new URL(
  '../../platform/errors/src/tooling-error.mjs',
  import.meta.url,
);
const configuredErrorFactory =
  process.env['PRESSLY_TOOLING_ERROR_FACTORY_PATH'];
const errorFactoryUrl =
  configuredErrorFactory === undefined || configuredErrorFactory.trim() === ''
    ? existsSync(fileURLToPath(adjacentErrorFactory))
      ? adjacentErrorFactory
      : repositoryErrorFactory
    : pathToFileURL(resolve(configuredErrorFactory));
const { toolingError } = await import(errorFactoryUrl.href);

const fail = (code, message, cause) => {
  throw toolingError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
};

const shaPattern = /^[0-9a-f]{40}$/u;
const imagePattern = /^(ghcr\.io\/[a-z0-9._/-]+)@sha256:([0-9a-f]{64})$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const imageApplications = Object.freeze({
  apiImage: 'api',
  webImage: 'web',
  workerImage: 'worker',
  processorImage: 'processor',
  controlImage: 'control',
});
const identityFields = Object.freeze([
  'releaseFormat',
  'sourceSha',
  ...Object.keys(imageApplications),
]);
const releaseFields = Object.freeze([...identityFields, 'deployedAt']);
const stateFields = Object.freeze([
  'schemaVersion',
  ...identityFields,
  'phase',
  'outcome',
  'exitCode',
  'updatedAt',
]);

const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactFields = (value, expectedFields) => {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
  return (
    actual.length === expected.length &&
    actual.every((field, index) => field === expected[index])
  );
};

const isCanonicalTimestamp = (value) => {
  if (typeof value !== 'string' || !timestampPattern.test(value)) return false;
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().replace('.000Z', 'Z') === value
  );
};

const readRegularFile = (path, description) => {
  let status;
  try {
    status = lstatSync(path);
  } catch (cause) {
    return fail(
      'production_recovery_evidence_missing',
      `${description} is missing.`,
      cause,
    );
  }
  if (!status.isFile() || status.isSymbolicLink())
    return fail(
      'production_recovery_evidence_not_regular',
      `${description} must be a regular file.`,
    );
  if ((status.mode & 0o777) !== 0o600)
    return fail(
      'production_recovery_evidence_mode_invalid',
      `${description} must have mode 600.`,
    );
  return readFileSync(path, 'utf8');
};

const readCanonicalSha = (path, description) => {
  const value = readRegularFile(path, description);
  if (value !== `${value.trim()}\n` || !shaPattern.test(value.trim()))
    return fail(
      'production_recovery_sha_file_invalid',
      `${description} must contain one canonical commit SHA.`,
    );
  return value.trim();
};

const readJsonObject = (path, description) => {
  const source = readRegularFile(path, description);
  let value;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    return fail(
      'production_recovery_json_invalid',
      `${description} is invalid JSON.`,
      cause,
    );
  }
  if (!isObject(value))
    return fail(
      'production_recovery_json_invalid',
      `${description} must contain a JSON object.`,
    );
  return value;
};

const identity = (value) =>
  Object.fromEntries(identityFields.map((field) => [field, value[field]]));

const sameIdentity = (left, right) =>
  identityFields.every((field) => left[field] === right[field]);

const validateIdentity = (value, description) => {
  if (!hasExactFields(value, identityFields))
    return fail(
      'production_recovery_identity_fields_invalid',
      `${description} fields are incomplete or unknown.`,
    );
  if (
    value.releaseFormat !== 'five-image-v1' ||
    typeof value.sourceSha !== 'string' ||
    !shaPattern.test(value.sourceSha)
  )
    return fail(
      'production_recovery_identity_invalid',
      `${description} release identity is invalid.`,
    );

  const repositories = new Set();
  const digests = new Set();
  for (const [field, application] of Object.entries(imageApplications)) {
    const image = value[field];
    const match = typeof image === 'string' ? image.match(imagePattern) : null;
    const repository = match?.[1];
    const digest = match?.[2];
    const repositoryName = repository?.split('/').at(-1);
    if (
      repository === undefined ||
      digest === undefined ||
      (repositoryName !== application &&
        repositoryName !== `pressly-${application}`)
    )
      return fail(
        'production_recovery_image_invalid',
        `${description} ${field} is invalid.`,
      );
    repositories.add(repository);
    digests.add(digest);
  }
  if (
    repositories.size !== Object.keys(imageApplications).length ||
    digests.size !== Object.keys(imageApplications).length
  )
    return fail(
      'production_recovery_images_not_distinct',
      `${description} images must use distinct repositories and digests.`,
    );
  return value;
};

const validateRelease = (value, description) => {
  if (!hasExactFields(value, releaseFields))
    return fail(
      'production_recovery_release_fields_invalid',
      `${description} fields are incomplete or unknown.`,
    );
  validateIdentity(identity(value), description);
  if (!isCanonicalTimestamp(value.deployedAt))
    return fail(
      'production_recovery_release_timestamp_invalid',
      `${description} deployedAt is invalid.`,
    );
  return value;
};

const validateState = (value) => {
  if (!hasExactFields(value, stateFields) || value.schemaVersion !== 1)
    return fail(
      'production_recovery_state_fields_invalid',
      'Deployment state fields are incomplete or unknown.',
    );
  validateIdentity(identity(value), 'Deployment state');
  if (!isCanonicalTimestamp(value.updatedAt))
    return fail(
      'production_recovery_state_timestamp_invalid',
      'Deployment state updatedAt is invalid.',
    );
  return value;
};

const validateOpsCurrent = (path, expectedCurrentSha) => {
  let linkStatus;
  try {
    linkStatus = lstatSync(path);
  } catch (cause) {
    return fail(
      'production_recovery_ops_current_missing',
      'The stable operations current pointer is missing.',
      cause,
    );
  }
  if (!linkStatus.isSymbolicLink())
    return fail(
      'production_recovery_ops_current_invalid',
      'The stable operations current pointer must be a symbolic link.',
    );

  let releaseDirectory;
  try {
    releaseDirectory = realpathSync(path);
  } catch (cause) {
    return fail(
      'production_recovery_ops_current_invalid',
      'The stable operations current pointer is dangling or unreadable.',
      cause,
    );
  }
  const expectedReleaseDirectory = resolve(
    dirname(path),
    'releases',
    expectedCurrentSha,
  );
  if (
    releaseDirectory !== expectedReleaseDirectory ||
    basename(releaseDirectory) !== expectedCurrentSha ||
    basename(dirname(releaseDirectory)) !== 'releases'
  )
    return fail(
      'production_recovery_ops_current_mismatch',
      'The stable operations current pointer does not match the expected current release.',
    );
  if (
    readCanonicalSha(
      resolve(releaseDirectory, 'source-sha'),
      'Stable operations source marker',
    ) !== expectedCurrentSha
  )
    return fail(
      'production_recovery_ops_current_mismatch',
      'The stable operations source marker does not match the expected current release.',
    );
  const rollbackPath = resolve(releaseDirectory, 'rollback.sh');
  let rollbackStatus;
  try {
    rollbackStatus = statSync(rollbackPath);
  } catch (cause) {
    return fail(
      'production_recovery_rollback_missing',
      'The stable rollback entrypoint is missing.',
      cause,
    );
  }
  if (!rollbackStatus.isFile() || (rollbackStatus.mode & 0o111) === 0)
    return fail(
      'production_recovery_rollback_invalid',
      'The stable rollback entrypoint must be executable.',
    );
};

export const validateProductionRecoveryEvidence = ({
  mode,
  expectedCurrentSha,
  expectedUnverifiedSha,
  deploymentStatePath,
  currentReleasePointerPath,
  currentReleaseMetadataPath,
  previousReleasePointerPath,
  previousReleaseMetadataPath,
  checkoutSha,
  opsCurrentPath,
}) => {
  if (!new Set(['preflight', 'verify']).has(mode))
    return fail(
      'production_recovery_mode_invalid',
      'Recovery evidence mode must be preflight or verify.',
    );
  if (
    !shaPattern.test(expectedCurrentSha) ||
    !shaPattern.test(expectedUnverifiedSha) ||
    expectedCurrentSha === expectedUnverifiedSha
  )
    return fail(
      'production_recovery_expected_identity_invalid',
      'Expected current and unverified SHAs must be distinct canonical commit SHAs.',
    );
  if (checkoutSha !== expectedCurrentSha)
    return fail(
      'production_recovery_checkout_mismatch',
      'Repository checkout does not match the expected current release.',
    );

  const current = validateRelease(
    readJsonObject(currentReleaseMetadataPath, 'Current release metadata'),
    'Current release metadata',
  );
  const previous = validateRelease(
    readJsonObject(previousReleaseMetadataPath, 'Previous release metadata'),
    'Previous release metadata',
  );
  const state = validateState(
    readJsonObject(deploymentStatePath, 'Deployment state'),
  );
  if (
    current.sourceSha !== expectedCurrentSha ||
    !sameIdentity(current, previous) ||
    readCanonicalSha(currentReleasePointerPath, 'Current release pointer') !==
      expectedCurrentSha ||
    readCanonicalSha(previousReleasePointerPath, 'Previous release pointer') !==
      expectedCurrentSha
  )
    return fail(
      'production_recovery_release_mismatch',
      'Current and previous release evidence does not match the expected current release.',
    );
  validateOpsCurrent(opsCurrentPath, expectedCurrentSha);

  if (mode === 'preflight') {
    if (
      state.sourceSha !== expectedUnverifiedSha ||
      state.phase !== 'running_unverified' ||
      state.outcome !== 'failed' ||
      !Number.isInteger(state.exitCode) ||
      state.exitCode < 1 ||
      state.exitCode > 255
    )
      return fail(
        'production_recovery_unverified_state_mismatch',
        'Deployment state is not the exact failed running-unverified release expected for reconciliation.',
      );
  } else if (
    !sameIdentity(state, current) ||
    state.phase !== 'verified' ||
    state.outcome !== 'succeeded' ||
    state.exitCode !== 0
  )
    return fail(
      'production_recovery_verified_state_mismatch',
      'Deployment state did not reconcile to the exact verified current release.',
    );

  return Object.freeze({
    mode,
    currentSha: expectedCurrentSha,
    ...(mode === 'preflight' ? { unresolvedSha: expectedUnverifiedSha } : {}),
  });
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [
    mode = '',
    expectedCurrentSha = '',
    expectedUnverifiedSha = '',
    deploymentStatePath = '',
    currentReleasePointerPath = '',
    currentReleaseMetadataPath = '',
    previousReleasePointerPath = '',
    previousReleaseMetadataPath = '',
    checkoutSha = '',
    opsCurrentPath = '',
  ] = process.argv.slice(2);
  const result = validateProductionRecoveryEvidence({
    mode,
    expectedCurrentSha,
    expectedUnverifiedSha,
    deploymentStatePath,
    currentReleasePointerPath,
    currentReleaseMetadataPath,
    previousReleasePointerPath,
    previousReleaseMetadataPath,
    checkoutSha,
    opsCurrentPath,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
