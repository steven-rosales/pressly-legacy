#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const adjacentErrorFactory = new URL('./tooling-error.mjs', import.meta.url);
const repositoryErrorFactory = new URL(
  '../../../platform/errors/src/tooling-error.mjs',
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

const errorMessage = (error) =>
  typeof error === 'object' &&
  error !== null &&
  'message' in error &&
  typeof error.message === 'string'
    ? error.message
    : String(error);

const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const exactKeys = (value, expected) => {
  if (!isObject(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
};

const parseStrictJson = (source, description) => {
  let position = 0;
  const invalid = (detail = 'is invalid JSON') =>
    fail('deployment_json_invalid', `${description} ${detail}.`);
  const whitespace = () => {
    while (/\s/u.test(source[position] ?? '')) position += 1;
  };
  const parseString = () => {
    if (source[position] !== '"') return invalid();
    const start = position;
    position += 1;
    let escaped = false;
    while (position < source.length) {
      const character = source[position];
      position += 1;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '"') {
        try {
          return JSON.parse(source.slice(start, position));
        } catch (cause) {
          return invalid(errorMessage(cause));
        }
      }
    }
    return invalid();
  };
  const parseValue = () => {
    whitespace();
    const character = source[position];
    if (character === '"') return parseString();
    if (character === '{') {
      position += 1;
      whitespace();
      const value = {};
      const keys = new Set();
      if (source[position] === '}') {
        position += 1;
        return value;
      }
      while (position < source.length) {
        whitespace();
        const key = parseString();
        if (keys.has(key))
          fail(
            'deployment_json_duplicate_field',
            `${description} contains duplicate field '${key}'.`,
          );
        keys.add(key);
        whitespace();
        if (source[position] !== ':') return invalid();
        position += 1;
        const child = parseValue();
        Object.defineProperty(value, key, {
          value: child,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        whitespace();
        if (source[position] === '}') {
          position += 1;
          return value;
        }
        if (source[position] !== ',') return invalid();
        position += 1;
      }
      return invalid();
    }
    if (character === '[') {
      position += 1;
      whitespace();
      const value = [];
      if (source[position] === ']') {
        position += 1;
        return value;
      }
      while (position < source.length) {
        value.push(parseValue());
        whitespace();
        if (source[position] === ']') {
          position += 1;
          return value;
        }
        if (source[position] !== ',') return invalid();
        position += 1;
      }
      return invalid();
    }
    for (const [token, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ]) {
      if (source.startsWith(token, position)) {
        position += token.length;
        return value;
      }
    }
    const number = source
      .slice(position)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u)?.[0];
    if (number !== undefined) {
      position += number.length;
      return JSON.parse(number);
    }
    return invalid();
  };

  const value = parseValue();
  whitespace();
  if (position !== source.length) invalid();
  return value;
};

const readStrictObject = (path, description) => {
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch (cause) {
    return fail(
      'deployment_json_read_failed',
      `Cannot read ${description}: ${errorMessage(cause)}`,
      cause,
    );
  }
  const value = parseStrictJson(source, description);
  if (!isObject(value))
    return fail(
      'deployment_json_object_required',
      `${description} must be a JSON object.`,
    );
  return value;
};

const parseStrictObject = (source, description) => {
  const value = parseStrictJson(source, description);
  if (!isObject(value))
    return fail(
      'deployment_json_object_required',
      `${description} must be a JSON object.`,
    );
  return value;
};

const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  );
};

const canonicalJson = (value) => JSON.stringify(canonicalValue(value));

const deepEqual = (left, right) => canonicalJson(left) === canonicalJson(right);

const openDirectory = (path) =>
  openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);

const fsyncDirectory = (path) => {
  const descriptor = openDirectory(path);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

const temporaryPathFor = (destination) => {
  const directory = dirname(resolve(destination));
  const prefix = `.${basename(destination)}.tmp.`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const path = join(
      directory,
      `${prefix}${process.pid}.${randomBytes(8).toString('hex')}`,
    );
    try {
      const descriptor = openSync(path, 'wx', 0o600);
      return { descriptor, path };
    } catch (cause) {
      if (
        typeof cause !== 'object' ||
        cause === null ||
        !('code' in cause) ||
        cause.code !== 'EEXIST'
      )
        throw cause;
    }
  }
  return fail(
    'deployment_temporary_file_exhausted',
    `Could not allocate a temporary file beside ${destination}.`,
  );
};

const hasErrorCode = (value, code) =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  value.code === code;

const closeIfOpen = (descriptor) => {
  try {
    closeSync(descriptor);
  } catch (cause) {
    if (!hasErrorCode(cause, 'EBADF')) throw cause;
  }
};

const unlinkIfPresent = (path) => {
  try {
    unlinkSync(path);
  } catch (cause) {
    if (!hasErrorCode(cause, 'ENOENT')) throw cause;
  }
};

const durableWrite = (destination, bytes, mode = 0o600) => {
  const directory = dirname(resolve(destination));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = temporaryPathFor(destination);
  let descriptorOpen = true;
  try {
    fchmodSync(temporary.descriptor, mode);
    writeFileSync(temporary.descriptor, bytes);
    fsyncSync(temporary.descriptor);
    closeSync(temporary.descriptor);
    descriptorOpen = false;
    renameSync(temporary.path, destination);
    fsyncDirectory(directory);
  } catch (cause) {
    if (descriptorOpen) {
      closeIfOpen(temporary.descriptor);
    }
    unlinkIfPresent(temporary.path);
    throw cause;
  }
};

const durableWriteJson = (destination, value) =>
  durableWrite(destination, `${JSON.stringify(value)}\n`);

const durableUnlink = (path, missingMessage) => {
  try {
    unlinkSync(path);
  } catch (cause) {
    if (
      missingMessage !== undefined &&
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === 'ENOENT'
    )
      return fail('deployment_file_missing', missingMessage, cause);
    throw cause;
  }
  fsyncDirectory(dirname(resolve(path)));
};

const currentTimestamp = () =>
  new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');

const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const isCanonicalTimestamp = (value) => {
  if (typeof value !== 'string' || !timestampPattern.test(value)) return false;
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().replace('.000Z', 'Z') === value
  );
};

const parseCanonicalTimestamp = (value, description) => {
  if (!isCanonicalTimestamp(value))
    return fail(
      'deployment_timestamp_invalid',
      `${description} must be a real UTC timestamp.`,
    );
  return new Date(value);
};

const canonicalIpv4 = (value) => {
  if (typeof value !== 'string') return undefined;
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  const numbers = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(part)) return undefined;
    const number = Number(part);
    if (number > 255) return undefined;
    numbers.push(number);
  }
  const canonical = numbers.join('.');
  return canonical === value ? canonical : undefined;
};

const parseHttpsHostname = (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (cause) {
    return fail(
      'deployment_health_url_invalid',
      `invalid health URL: ${errorMessage(cause)}`,
      cause,
    );
  }
  if (parsed.protocol.toLowerCase() !== 'https:')
    return fail(
      'deployment_health_url_scheme_invalid',
      'health URL must use HTTPS',
    );
  if (
    parsed.hostname === '' ||
    parsed.username !== '' ||
    parsed.password !== ''
  )
    return fail(
      'deployment_health_url_authority_invalid',
      'health URL must contain an unauthenticated hostname',
    );
  if (parsed.port !== '' && parsed.port !== '443')
    return fail(
      'deployment_health_url_port_invalid',
      'health URL must use the default HTTPS port',
    );
  return parsed.hostname;
};

const shaPattern = /^[0-9a-f]{40}$/u;
const imagePattern = /^(ghcr\.io\/[a-z0-9._/-]+)@sha256:([0-9a-f]{64})$/u;
const imageApplications = Object.freeze({
  apiImage: 'api',
  webImage: 'web',
  workerImage: 'worker',
  processorImage: 'processor',
  controlImage: 'control',
});
const imageFields = Object.freeze(Object.keys(imageApplications));
const identityFields = Object.freeze([
  'releaseFormat',
  'sourceSha',
  ...imageFields,
]);
const releaseFields = Object.freeze([...identityFields, 'deployedAt']);

const identityObject = (value) =>
  Object.fromEntries(identityFields.map((field) => [field, value[field]]));

const identityValues = (value) => identityFields.map((field) => value[field]);

const sameIdentity = (left, right) =>
  deepEqual(identityValues(left), identityValues(right));

const validateGhcrIdentity = (value, description) => {
  if (!exactKeys(value, identityFields))
    return fail(
      'deployment_release_identity_fields_invalid',
      `${description} fields are incomplete or unknown.`,
    );
  if (value.releaseFormat !== 'five-image-v1')
    return fail(
      'deployment_release_format_invalid',
      `${description} releaseFormat is invalid.`,
    );
  if (typeof value.sourceSha !== 'string' || !shaPattern.test(value.sourceSha))
    return fail(
      'deployment_release_sha_invalid',
      `${description} sourceSha is invalid.`,
    );
  const repositories = new Set();
  const digests = new Set();
  for (const field of imageFields) {
    const image = value[field];
    const match =
      typeof image === 'string' ? image.match(imagePattern) : undefined;
    if (match === undefined || match === null)
      return fail(
        'deployment_release_image_invalid',
        `${description} ${field} must be an immutable GHCR digest.`,
      );
    const [, repository, digest] = match;
    const application = imageApplications[field];
    const repositoryName = repository.split('/').at(-1);
    if (
      repositoryName !== application &&
      repositoryName !== `pressly-${application}`
    )
      return fail(
        'deployment_release_repository_invalid',
        `${description} ${field} repository does not match ${application}.`,
      );
    repositories.add(repository);
    digests.add(digest);
  }
  if (repositories.size !== imageFields.length)
    return fail(
      'deployment_release_repositories_not_distinct',
      `${description} image repositories must be distinct.`,
    );
  if (digests.size !== imageFields.length)
    return fail(
      'deployment_release_digests_not_distinct',
      `${description} image digests must be distinct.`,
    );
  return value;
};

const validateReleaseRecord = (value, description) => {
  if (!exactKeys(value, releaseFields))
    return fail(
      'deployment_release_fields_invalid',
      `${description} fields are incomplete or unknown.`,
    );
  validateGhcrIdentity(identityObject(value), description);
  if (!isCanonicalTimestamp(value.deployedAt))
    return fail(
      'deployment_release_timestamp_invalid',
      `${description} deployedAt is invalid.`,
    );
  return value;
};

const normalizeExitCode = (value) => {
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 255))
    return fail(
      'deployment_state_exit_code_invalid',
      'exitCode must be null or an integer between 0 and 255.',
    );
  return value !== null && value !== 0 ? 'nonzero' : value;
};

const standardStateKeys = new Set([
  'schemaVersion',
  ...identityFields,
  'phase',
  'outcome',
  'exitCode',
  'updatedAt',
]);
const recoveryStateKeys = new Set([
  'schemaVersion',
  'phase',
  'outcome',
  'exitCode',
  'updatedAt',
  'unresolvedRelease',
  'recoveryTarget',
  'rollbackPrevious',
]);

const validateDeploymentState = (value) => {
  if (value.schemaVersion === 1) {
    if (!exactKeys(value, standardStateKeys))
      return fail(
        'deployment_state_fields_invalid',
        'deployment state fields are incomplete or unknown.',
      );
    validateGhcrIdentity(identityObject(value), 'deployment state');
    const key = `${value.phase}|${value.outcome}|${String(
      normalizeExitCode(value.exitCode),
    )}`;
    if (
      !new Set([
        'attempted|in_progress|null',
        'running_unverified|in_progress|null',
        'running_unverified|failed|nonzero',
        'failed_before_running|failed|nonzero',
        'verified|succeeded|0',
      ]).has(key)
    )
      return fail(
        'deployment_state_tuple_invalid',
        'phase, outcome, and exitCode are inconsistent.',
      );
    if (!isCanonicalTimestamp(value.updatedAt))
      return fail(
        'deployment_state_timestamp_invalid',
        'updatedAt is invalid.',
      );
    return 'standard';
  }
  if (value.schemaVersion === 2) {
    if (!exactKeys(value, recoveryStateKeys))
      return fail(
        'deployment_recovery_fields_invalid',
        'recovery state fields are incomplete or unknown.',
      );
    validateGhcrIdentity(value.unresolvedRelease, 'unresolved release');
    validateReleaseRecord(value.recoveryTarget, 'recovery target');
    if (sameIdentity(value.unresolvedRelease, value.recoveryTarget))
      return fail(
        'deployment_recovery_identity_collision',
        'recovery identities must be distinct.',
      );
    if (value.rollbackPrevious !== null) {
      validateReleaseRecord(
        value.rollbackPrevious,
        'rollback previous release',
      );
      if (sameIdentity(value.rollbackPrevious, value.recoveryTarget))
        return fail(
          'deployment_rollback_identity_collision',
          'rollback previous release must differ from recovery target.',
        );
    }
    const key = `${value.phase}|${value.outcome}|${String(
      normalizeExitCode(value.exitCode),
    )}`;
    if (
      !new Set([
        'recovering_unverified|in_progress|null',
        'recovering_unverified|failed|nonzero',
      ]).has(key)
    )
      return fail(
        'deployment_recovery_tuple_invalid',
        'recovery phase, outcome, and exitCode are inconsistent.',
      );
    if (!isCanonicalTimestamp(value.updatedAt))
      return fail(
        'deployment_recovery_timestamp_invalid',
        'updatedAt is invalid.',
      );
    return 'recovery';
  }
  return fail('deployment_state_schema_invalid', 'schemaVersion is invalid.');
};

const deploymentStateOperation = (args) => {
  const [
    path,
    action,
    invocationMode,
    releaseFormat,
    sourceSha,
    apiImage,
    webImage,
    workerImage,
    processorImage,
    controlImage,
    rollbackManifestPath,
    currentMetadataPath,
    phase,
    outcome,
    rawExitCode,
  ] = args;
  const target = {
    releaseFormat,
    sourceSha,
    apiImage,
    webImage,
    workerImage,
    processorImage,
    controlImage,
  };
  try {
    validateGhcrIdentity(target, 'deployment target');
  } catch (cause) {
    return fail(
      'deployment_state_target_invalid',
      `Deployment state target is invalid: ${errorMessage(cause)}`,
      cause,
    );
  }
  const loadState = () => {
    const state = readStrictObject(path, 'deployment state');
    const kind = validateDeploymentState(state);
    return { state, kind };
  };
  const loadRollback = () => {
    if (rollbackManifestPath === '-')
      return fail(
        'deployment_rollback_manifest_missing',
        'Rollback admission failed: rollback release manifest is missing.',
      );
    return validateReleaseRecord(
      readStrictObject(rollbackManifestPath, 'rollback release manifest'),
      'rollback release',
    );
  };

  if (action === 'guard') {
    if (!new Set(['normal', 'resume', 'rollback']).has(invocationMode))
      return fail(
        'deployment_state_invocation_invalid',
        'Deployment state invocation mode is invalid.',
      );
    if (invocationMode === 'rollback' && !sameIdentity(loadRollback(), target))
      return fail(
        'deployment_rollback_target_mismatch',
        'Rollback target does not exactly match the admitted release manifest.',
      );
    if (!existsSync(path)) {
      if (invocationMode === 'resume')
        return fail(
          'deployment_resume_state_missing',
          '--resume-unverified requires an existing running_unverified deployment state.',
        );
      if (invocationMode === 'rollback') process.stdout.write('reconcile\n');
      return;
    }
    let loaded;
    try {
      loaded = loadState();
    } catch (cause) {
      return fail(
        'deployment_state_invalid',
        `Deployment state is invalid: ${errorMessage(cause)}`,
        cause,
      );
    }
    const { state, kind } = loaded;
    if (invocationMode === 'normal') {
      if (kind === 'recovery')
        return fail(
          'deployment_recovery_unresolved',
          'Deployment recovery is unresolved; retry rollback with the exact recorded recovery target.',
        );
      if (state.phase === 'running_unverified')
        return fail(
          'deployment_running_unverified',
          'Deployment state is running_unverified; use --resume-unverified with the exact recorded target or reconcile it before a new deployment.',
        );
      return;
    }
    if (invocationMode === 'rollback') {
      if (kind === 'recovery') {
        if (!sameIdentity(state.recoveryTarget, target))
          return fail(
            'deployment_recovery_target_mismatch',
            'Rollback target does not exactly match the recorded recovery target.',
          );
        process.stdout.write('recover\n');
        return;
      }
      process.stdout.write('reconcile\n');
      return;
    }
    if (kind === 'recovery')
      return fail(
        'deployment_resume_recovery_forbidden',
        '--resume-unverified cannot erase an unresolved rollback recovery; retry rollback with the exact recorded recovery target.',
      );
    if (state.phase !== 'running_unverified')
      return fail(
        'deployment_resume_phase_invalid',
        '--resume-unverified requires an existing running_unverified deployment state.',
      );
    if (!sameIdentity(state, target))
      return fail(
        'deployment_resume_target_mismatch',
        '--resume-unverified target does not exactly match the recorded running_unverified release identity.',
      );
    return;
  }

  if (!new Set(['write', 'start_recovery', 'write_recovery']).has(action))
    return fail(
      'deployment_state_operation_invalid',
      'Deployment state operation is invalid.',
    );
  let parsedExitCode = null;
  if (rawExitCode !== '-') {
    if (!/^-?[0-9]+$/u.test(rawExitCode))
      return fail(
        'deployment_state_exit_code_invalid',
        'Deployment state exit code is invalid.',
      );
    parsedExitCode = Number(rawExitCode);
  }
  let state;
  if (action === 'write') {
    state = {
      schemaVersion: 1,
      ...target,
      phase,
      outcome,
      exitCode: parsedExitCode,
      updatedAt: currentTimestamp(),
    };
  } else {
    let existing;
    let existingKind;
    if (existsSync(path)) {
      const loaded = loadState();
      existing = loaded.state;
      existingKind = loaded.kind;
    }
    let unresolvedRelease;
    let recoveryTarget;
    let rollbackPrevious;
    if (action === 'start_recovery') {
      if (existingKind === 'recovery') {
        ({ unresolvedRelease, recoveryTarget, rollbackPrevious } = existing);
        if (!sameIdentity(existing.recoveryTarget, target))
          return fail(
            'deployment_recovery_target_mismatch',
            'Recovery target does not exactly match the recorded target.',
          );
      } else {
        recoveryTarget = loadRollback();
        if (!sameIdentity(recoveryTarget, target))
          return fail(
            'deployment_recovery_manifest_mismatch',
            'Recovery target does not match the admitted rollback manifest.',
          );
        const currentRelease = validateReleaseRecord(
          readStrictObject(currentMetadataPath, 'current release metadata'),
          'current release metadata',
        );
        const currentIdentity = identityObject(currentRelease);
        unresolvedRelease =
          existingKind === 'standard' &&
          existing.phase === 'running_unverified' &&
          !sameIdentity(existing, target)
            ? identityObject(existing)
            : currentIdentity;
        rollbackPrevious = !sameIdentity(currentIdentity, target)
          ? currentRelease
          : null;
      }
    } else {
      if (existingKind !== 'recovery')
        return fail(
          'deployment_recovery_missing',
          'No rollback recovery is currently in progress.',
        );
      if (!sameIdentity(existing.recoveryTarget, target))
        return fail(
          'deployment_recovery_target_mismatch',
          'Recovery target does not exactly match the recorded target.',
        );
      ({ unresolvedRelease, recoveryTarget, rollbackPrevious } = existing);
    }
    state = {
      schemaVersion: 2,
      phase,
      outcome,
      exitCode: parsedExitCode,
      updatedAt: currentTimestamp(),
      unresolvedRelease,
      recoveryTarget,
      rollbackPrevious,
    };
  }
  try {
    validateDeploymentState(state);
  } catch (cause) {
    return fail(
      'deployment_state_invalid',
      `Deployment state is invalid: ${errorMessage(cause)}`,
      cause,
    );
  }
  durableWriteJson(path, state);
};

const rollbackRelease = ([previousPath, statePath]) => {
  let release;
  if (existsSync(statePath) && statSync(statePath).isFile()) {
    const state = readStrictObject(statePath, 'Deployment state');
    if (state.schemaVersion === 2) {
      if (
        !exactKeys(state, recoveryStateKeys) ||
        state.phase !== 'recovering_unverified' ||
        !new Set(['in_progress', 'failed']).has(state.outcome)
      )
        return fail(
          'deployment_recovery_state_invalid',
          'Deployment recovery state is invalid.',
        );
      release = state.recoveryTarget;
    }
  }
  release ??= readStrictObject(previousPath, 'Previous release manifest');
  try {
    validateReleaseRecord(release, 'Previous release manifest');
  } catch (cause) {
    return fail(
      'deployment_previous_release_invalid',
      'Previous release manifest is invalid.',
      cause,
    );
  }
  process.stdout.write(
    `${JSON.stringify(release)}\n${release.sourceSha}\n${release.apiImage}\n${release.webImage}\n${release.workerImage}\n${release.processorImage}\n${release.controlImage}\n`,
  );
};

const releaseMetadataPreflight = (args) => {
  const [
    currentShaPath,
    currentMetadataPath,
    snapshotPath,
    targetFormat,
    targetSha,
    targetApi,
    targetWeb,
    targetWorker,
    targetProcessor,
    targetControl,
    deploymentStatePath,
    rollbackMode,
  ] = args;
  const target = {
    releaseFormat: targetFormat,
    sourceSha: targetSha,
    apiImage: targetApi,
    webImage: targetWeb,
    workerImage: targetWorker,
    processorImage: targetProcessor,
    controlImage: targetControl,
  };
  try {
    validateGhcrIdentity(target, 'deployment target');
    const pointerExists =
      existsSync(currentShaPath) && statSync(currentShaPath).isFile();
    const metadataExists =
      existsSync(currentMetadataPath) && statSync(currentMetadataPath).isFile();
    if (pointerExists && !metadataExists)
      return fail(
        'deployment_release_metadata_missing',
        'current release metadata is missing for the derived SHA pointer',
      );
    if (!metadataExists) return;
    const current = readStrictObject(
      currentMetadataPath,
      'current release metadata',
    );
    if (
      !exactKeys(current, releaseFields) ||
      current.releaseFormat !== 'five-image-v1'
    )
      return fail(
        'deployment_current_release_shape_invalid',
        'metadata is not a complete five-image release',
      );
    validateReleaseRecord(current, 'current release metadata');
    if (current.sourceSha === targetSha && !sameIdentity(current, target))
      return fail(
        'deployment_release_sha_reused',
        'the source SHA is already associated with a different release',
      );
    let snapshotRelease = !sameIdentity(current, target) ? current : null;
    if (rollbackMode === 'true') {
      const recoveryState = readStrictObject(
        deploymentStatePath,
        'deployment state',
      );
      if (
        !exactKeys(recoveryState, recoveryStateKeys) ||
        recoveryState.schemaVersion !== 2 ||
        recoveryState.phase !== 'recovering_unverified' ||
        !sameIdentity(recoveryState.recoveryTarget, target)
      )
        return fail(
          'deployment_rollback_recovery_journal_invalid',
          'rollback recovery journal is invalid',
        );
      snapshotRelease = recoveryState.rollbackPrevious;
      if (snapshotRelease !== null)
        validateReleaseRecord(snapshotRelease, 'rollback previous release');
      if (snapshotRelease !== null && sameIdentity(snapshotRelease, target))
        return fail(
          'deployment_rollback_previous_is_target',
          'rollback recovery previous release is the target',
        );
    }
    if (snapshotRelease !== null && snapshotPath !== '-')
      writeFileSync(
        snapshotPath,
        `${JSON.stringify(snapshotRelease)}\n`,
        'utf8',
      );
  } catch (cause) {
    if (
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      String(cause.code).startsWith('deployment_')
    )
      return fail(
        'deployment_release_metadata_preflight_failed',
        `Release metadata preflight failed: ${errorMessage(cause)}.`,
        cause,
      );
    throw cause;
  }
};

const durableInstallReleasePair = ([
  releaseTemporary,
  releasePath,
  metadataTemporary,
  metadataPath,
  killAfterReleasePointer,
]) => {
  if (
    killAfterReleasePointer !== undefined &&
    !new Set(['true', 'false']).has(killAfterReleasePointer)
  )
    return fail(
      'deployment_release_pair_killpoint_invalid',
      'release pair killpoint must be exactly true or false',
    );
  for (const path of [releaseTemporary, metadataTemporary]) {
    const descriptor = openSync(path, constants.O_RDONLY);
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
  renameSync(releaseTemporary, releasePath);
  if (killAfterReleasePointer === 'true') process.kill(process.pid, 'SIGKILL');
  renameSync(metadataTemporary, metadataPath);
  for (const directory of new Set([
    dirname(resolve(releasePath)),
    dirname(resolve(metadataPath)),
  ]))
    fsyncDirectory(directory);
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileSha256 = (path) => sha256(readFileSync(path));

const installOpsBundle = (args) => {
  const [
    sourceDirectory,
    opsRoot,
    sourceSha,
    linkName,
    helperSource,
    errorFactorySource,
  ] = args;
  const shellNames = [
    'deploy.sh',
    'rollback.sh',
    'backup-postgres.sh',
    'check-host-capacity.sh',
    'configure-database-roles.sh',
    'cutover-clean-epoch.sh',
    'recover-clean-epoch.sh',
    'restore-postgres-drill.sh',
    'restore-postgres.sh',
    'run-monitored-operation.sh',
  ];
  const recoveryAssetNames = [
    'Caddyfile',
    'clean-epoch-cutover.json',
    'clean-epoch-legacy-compose.override.yml',
    'docker-compose.production.yml',
  ];
  if (!new Set(['candidate', 'current']).has(linkName))
    return fail(
      'deployment_ops_link_invalid',
      'Operations bundle link name is invalid.',
    );
  const sourceEntries = [
    ...shellNames.map((name) => [name, join(sourceDirectory, name)]),
    ...recoveryAssetNames.map((name) => [name, join(sourceDirectory, name)]),
    ['deployment-tooling.mjs', helperSource],
    ['tooling-error.mjs', errorFactorySource],
  ];
  for (const [, path] of sourceEntries) {
    if (!existsSync(path))
      return fail(
        'deployment_ops_source_missing',
        `Operations bundle source is missing: ${path}`,
      );
    if (!lstatSync(path).isFile())
      return fail(
        'deployment_ops_source_not_regular',
        `Operations bundle source must be a regular file: ${path}`,
      );
  }
  const wrapper = (name) => {
    const siblingBinding =
      name === 'rollback.sh'
        ? 'export PRESSLY_DEPLOY_SCRIPT="$bundle_dir/deploy.sh"\n'
        : name === 'recover-clean-epoch.sh'
          ? 'export PRESSLY_CLEAN_EPOCH_ROLLBACK_SCRIPT="$bundle_dir/rollback.sh"\nexport PRESSLY_CLEAN_EPOCH_OPS_SOURCE_SHA_FILE="$bundle_dir/source-sha"\nexport PRESSLY_CLEAN_EPOCH_DECLARATION="$bundle_dir/payload/clean-epoch-cutover.json"\nexport PRESSLY_COMPOSE_FILE="$bundle_dir/payload/docker-compose.production.yml"\nexport PRESSLY_CLEAN_EPOCH_LEGACY_COMPOSE_OVERRIDE_FILE="$bundle_dir/payload/clean-epoch-legacy-compose.override.yml"\n'
          : '';
    return `#!/usr/bin/env bash
set -euo pipefail

bundle_dir="$(CDPATH= cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd -P)"
if ! (cd "$bundle_dir" && sha256sum --check --strict --status SHA256SUMS); then
  echo "Operations bundle checksum verification failed: $bundle_dir" >&2
  exit 70
fi
export PRESSLY_DEPLOY_TOOLING_FILE="$bundle_dir/payload/deployment-tooling.mjs"
export PRESSLY_TOOLING_ERROR_FACTORY_PATH="$bundle_dir/payload/tooling-error.mjs"
${siblingBinding}exec "$bundle_dir/payload/${name}" "$@"
`;
  };
  const wrappers = new Map(shellNames.map((name) => [name, wrapper(name)]));
  const sourceMarker = `${sourceSha}\n`;
  const manifest = `${sourceEntries
    .map(([name, sourcePath]) => {
      const wrapperLine = wrappers.has(name)
        ? `${sha256(wrappers.get(name))}  ${name}\n`
        : '';
      return `${wrapperLine}${fileSha256(sourcePath)}  payload/${name}\n`;
    })
    .join('')}${sha256(sourceMarker)}  source-sha\n`;

  mkdirSync(opsRoot, { recursive: true, mode: 0o700 });
  const releasesDirectory = join(opsRoot, 'releases');
  mkdirSync(releasesDirectory, { recursive: true, mode: 0o700 });
  const releaseDirectory = join(releasesDirectory, sourceSha);
  let temporaryDirectory;
  try {
    if (existsSync(releaseDirectory)) {
      const releaseStat = lstatSync(releaseDirectory);
      if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink())
        return fail(
          'deployment_ops_existing_invalid',
          'Operations bundle installation failed: existing operations release is not a directory.',
        );
      const installedSha = readFileSync(
        join(releaseDirectory, 'source-sha'),
        'utf8',
      ).trim();
      if (installedSha !== sourceSha)
        return fail(
          'deployment_ops_marker_mismatch',
          'Operations bundle installation failed: existing operations release marker does not match.',
        );
      for (const [name, sourcePath] of sourceEntries) {
        const installedPath = join(releaseDirectory, 'payload', name);
        if (
          !existsSync(installedPath) ||
          !lstatSync(installedPath).isFile() ||
          fileSha256(installedPath) !== fileSha256(sourcePath)
        )
          return fail(
            'deployment_ops_existing_payload_differs',
            `Operations bundle installation failed: existing operations release differs at ${name}.`,
          );
        if (wrappers.has(name)) {
          const wrapperPath = join(releaseDirectory, name);
          if (
            !existsSync(wrapperPath) ||
            !lstatSync(wrapperPath).isFile() ||
            fileSha256(wrapperPath) !== sha256(wrappers.get(name))
          )
            return fail(
              'deployment_ops_existing_wrapper_differs',
              `Operations bundle installation failed: existing operations release differs at ${name}.`,
            );
        }
      }
      if (
        readFileSync(join(releaseDirectory, 'SHA256SUMS'), 'utf8') !== manifest
      )
        return fail(
          'deployment_ops_manifest_differs',
          'Operations bundle installation failed: existing operations checksum manifest differs.',
        );
    } else {
      const temporaryBase = join(
        releasesDirectory,
        `.${sourceSha}.${process.pid}.${randomBytes(8).toString('hex')}`,
      );
      mkdirSync(temporaryBase, { mode: 0o700 });
      temporaryDirectory = temporaryBase;
      const payloadDirectory = join(temporaryDirectory, 'payload');
      mkdirSync(payloadDirectory, { mode: 0o700 });
      for (const [name, sourcePath] of sourceEntries) {
        const installedPath = join(payloadDirectory, name);
        copyFileSync(sourcePath, installedPath, constants.COPYFILE_EXCL);
        chmodSync(installedPath, 0o700);
        const descriptor = openSync(installedPath, constants.O_RDONLY);
        try {
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
        if (wrappers.has(name))
          durableWrite(
            join(temporaryDirectory, name),
            wrappers.get(name),
            0o700,
          );
      }
      durableWrite(join(temporaryDirectory, 'SHA256SUMS'), manifest);
      durableWrite(join(temporaryDirectory, 'source-sha'), sourceMarker);
      fsyncDirectory(payloadDirectory);
      fsyncDirectory(temporaryDirectory);
      renameSync(temporaryDirectory, releaseDirectory);
      temporaryDirectory = undefined;
      fsyncDirectory(releasesDirectory);
    }

    const temporary = temporaryPathFor(join(opsRoot, linkName));
    closeSync(temporary.descriptor);
    unlinkSync(temporary.path);
    try {
      symlinkSync(join('releases', sourceSha), temporary.path);
      renameSync(temporary.path, join(opsRoot, linkName));
    } finally {
      unlinkIfPresent(temporary.path);
    }
    fsyncDirectory(opsRoot);
  } finally {
    if (temporaryDirectory !== undefined)
      rmSync(temporaryDirectory, { recursive: true, force: true });
  }
};

const endpointNames = Object.freeze(['api', 'web', 'processor', 'control']);
const hostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const hostIdentityPattern = /^[a-z0-9][a-z0-9._-]{2,63}$/u;

const validatePublicHealthTarget = (value, description) => {
  if (
    !exactKeys(value, ['hostIdentity', 'expectedPublicIpv4', ...endpointNames])
  )
    return fail(
      'deployment_public_health_fields_invalid',
      `${description} fields are incomplete or unknown.`,
    );
  if (!hostIdentityPattern.test(value.hostIdentity ?? ''))
    return fail(
      'deployment_public_health_identity_invalid',
      `${description} hostIdentity is invalid.`,
    );
  if (canonicalIpv4(value.expectedPublicIpv4) === undefined)
    return fail(
      'deployment_public_health_ipv4_invalid',
      `${description} expectedPublicIpv4 must be canonical IPv4.`,
    );
  const hosts = new Set();
  for (const name of endpointNames) {
    const endpoint = value[name];
    if (!exactKeys(endpoint, ['url', 'host']))
      return fail(
        'deployment_public_health_endpoint_fields_invalid',
        `${description} ${name} fields are invalid.`,
      );
    if (
      typeof endpoint.url !== 'string' ||
      typeof endpoint.host !== 'string' ||
      !hostnamePattern.test(endpoint.host)
    )
      return fail(
        'deployment_public_health_endpoint_invalid',
        `${description} ${name} values are invalid.`,
      );
    let parsed;
    try {
      parsed = new URL(endpoint.url);
    } catch (cause) {
      return fail(
        'deployment_public_health_url_invalid',
        `${description} ${name} URL is invalid.`,
        cause,
      );
    }
    const authority = endpoint.url
      .slice('https://'.length)
      .split(/[/?#]/u, 1)[0];
    if (
      parsed.protocol !== 'https:' ||
      authority !== endpoint.host ||
      parsed.hostname !== endpoint.host ||
      parsed.port !== '' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      !parsed.pathname.startsWith('/') ||
      parsed.search !== '' ||
      parsed.hash !== ''
    )
      return fail(
        'deployment_public_health_authority_invalid',
        `${description} ${name} URL is not exact HTTPS authority.`,
      );
    if (hosts.has(endpoint.host))
      return fail(
        'deployment_public_health_hosts_not_distinct',
        `${description} hosts must be distinct.`,
      );
    hosts.add(endpoint.host);
  }
  return value;
};

const hostIdentityBindings = ([path, proofMode]) => {
  try {
    const absolutePath = resolve(path);
    if (path !== absolutePath || realpathSync(path) !== absolutePath)
      return fail(
        'deployment_host_identity_path_invalid',
        'host identity path must be canonical, absolute, and symlink-free',
      );
    const descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let document;
    try {
      const fileStat = fstatSync(descriptor);
      const mode = fileStat.mode & 0o777;
      if (!fileStat.isFile())
        return fail(
          'deployment_host_identity_not_regular',
          'host identity must be a regular file',
        );
      if (proofMode === 'true') {
        if (fileStat.uid !== process.getuid() || mode !== 0o600)
          return fail(
            'deployment_host_identity_proof_permissions_invalid',
            'proof host identity must be owner-owned mode 0600',
          );
      } else {
        const parentStat = lstatSync(dirname(path));
        if (
          !parentStat.isDirectory() ||
          parentStat.uid !== 0 ||
          (parentStat.mode & 0o022) !== 0
        )
          return fail(
            'deployment_host_identity_directory_permissions_invalid',
            'host identity directory must be root-owned and not group/world writable',
          );
        if (fileStat.uid !== 0 || mode !== 0o644)
          return fail(
            'deployment_host_identity_permissions_invalid',
            'host identity must be root-owned mode 0644',
          );
      }
      document = parseStrictObject(
        readFileSync(descriptor, 'utf8'),
        'host identity',
      );
    } finally {
      closeSync(descriptor);
    }
    if (
      !exactKeys(document, [
        'schemaVersion',
        'environment',
        'publicHealthTarget',
      ])
    )
      return fail(
        'deployment_host_identity_fields_invalid',
        'host identity fields are incomplete or unknown',
      );
    const expectedEnvironment = proofMode === 'true' ? 'proof' : 'production';
    if (
      document.schemaVersion !== 1 ||
      document.environment !== expectedEnvironment
    )
      return fail(
        'deployment_host_identity_schema_invalid',
        'host identity schema or environment is invalid',
      );
    const target = validatePublicHealthTarget(
      document.publicHealthTarget,
      'publicHealthTarget',
    );
    process.stdout.write(
      `${canonicalJson(target)}\n${target.expectedPublicIpv4}\n${endpointNames
        .flatMap((name) => [target[name].url, target[name].host])
        .join('\n')}\n`,
    );
  } catch (cause) {
    return fail(
      'deployment_host_identity_invalid',
      `Host identity is invalid: ${errorMessage(cause)}.`,
      cause,
    );
  }
};

const validateRestoreIdentity = (value, description, proofMode, proofTag) => {
  if (!exactKeys(value, identityFields))
    return fail(
      'restore_release_identity_fields_invalid',
      `${description} fields are incomplete or unknown.`,
    );
  if (value.releaseFormat !== 'five-image-v1')
    return fail(
      'restore_release_format_invalid',
      `${description} must use five-image-v1.`,
    );
  if (typeof value.sourceSha !== 'string' || !shaPattern.test(value.sourceSha))
    return fail(
      'restore_release_sha_invalid',
      `${description} sourceSha is invalid.`,
    );
  if (proofMode !== 'true') return validateGhcrIdentity(value, description);
  const repositories = new Set();
  for (const field of imageFields) {
    const application = imageApplications[field];
    const image = value[field];
    const pattern = new RegExp(
      `^pressly-restore-proof-[a-z0-9-]+-${application}:${proofTag}$`,
      'u',
    );
    if (typeof image !== 'string' || !pattern.test(image))
      return fail(
        'restore_release_proof_image_invalid',
        `${description} ${field} must be an isolated ${application} image.`,
      );
    repositories.add(image);
  }
  if (repositories.size !== imageFields.length)
    return fail(
      'restore_release_proof_images_not_distinct',
      'application image repositories must be distinct.',
    );
  return value;
};

const validateRestoreReleaseRecord = (
  value,
  description,
  proofMode,
  proofTag = 'proof',
) => {
  if (!exactKeys(value, releaseFields))
    return fail(
      'restore_release_record_fields_invalid',
      `${description} fields are incomplete or unknown.`,
    );
  validateRestoreIdentity(
    identityObject(value),
    description,
    proofMode,
    proofTag,
  );
  return parseCanonicalTimestamp(value.deployedAt, `${description} deployedAt`);
};

const validateExitState = (value, expectedPhase) => {
  if (
    value.phase === expectedPhase &&
    value.outcome === 'in_progress' &&
    value.exitCode === null
  )
    return;
  if (
    value.phase === expectedPhase &&
    value.outcome === 'failed' &&
    Number.isInteger(value.exitCode) &&
    value.exitCode >= 1 &&
    value.exitCode <= 255
  )
    return;
  return fail(
    'restore_deployment_exit_state_invalid',
    `${expectedPhase} phase, outcome, and exitCode are inconsistent.`,
  );
};

const restoreReleaseIdentity = (args) => {
  const [
    pointerPath,
    metadataPath,
    statePath,
    restoreJournalPath,
    proofMode,
    rawAllowUnverified,
  ] = args;
  try {
    const pointer = readFileSync(pointerPath, 'utf8');
    if (!/^[0-9a-f]{40}\n$/u.test(pointer))
      return fail(
        'restore_current_release_pointer_invalid',
        'current release pointer must contain one full lowercase SHA',
      );
    const pointerSha = pointer.slice(0, -1);
    const metadata = readStrictObject(metadataPath, 'current release metadata');
    const deployedAt = validateRestoreReleaseRecord(
      metadata,
      'current release metadata',
      proofMode,
    );
    const currentIdentity = identityObject(metadata);
    const state = readStrictObject(statePath, 'deployment state');
    if (pointerSha !== metadata.sourceSha)
      return fail(
        'restore_current_release_pointer_mismatch',
        'current release pointer and metadata SHA differ',
      );
    let admission;
    let unresolvedIdentity = null;
    let unresolvedState = null;
    let updatedAt;
    let stateIsVerified = false;
    if (state.schemaVersion === 1) {
      if (!exactKeys(state, standardStateKeys))
        return fail(
          'restore_deployment_state_fields_invalid',
          'deployment state fields are incomplete or unknown',
        );
      const stateIdentity = identityObject(state);
      if (
        state.phase === 'verified' &&
        state.outcome === 'succeeded' &&
        state.exitCode === 0
      ) {
        validateRestoreIdentity(
          stateIdentity,
          'deployment state',
          proofMode,
          'proof',
        );
        if (!sameIdentity(currentIdentity, stateIdentity))
          return fail(
            'restore_verified_state_mismatch',
            'verified deployment state does not match current release metadata',
          );
        admission = 'verified';
        stateIsVerified = true;
        if (existsSync(restoreJournalPath)) {
          const journal = readStrictObject(
            restoreJournalPath,
            'restore journal',
          );
          const journalFields = [
            'schemaVersion',
            'backupBasename',
            'backupSha256',
            'releaseIdentity',
            'publicHealthTarget',
            'opsBundleOrigin',
            'deploymentAdmission',
            'unresolvedReleaseIdentity',
            'unresolvedDeploymentState',
            'targetDatabase',
            'candidateDatabase',
            'quarantineDatabase',
            'resumeServices',
            'phase',
            'updatedAt',
          ];
          const canAdopt =
            new Set(['deployment_reconciling', 'deployment_reconciled']).has(
              journal.phase,
            ) ||
            (journal.phase === 'public_verified' &&
              journal.deploymentAdmission === 'running_unverified');
          if (canAdopt) {
            if (
              !exactKeys(journal, journalFields) ||
              journal.schemaVersion !== 1
            )
              return fail(
                'restore_reconciliation_journal_malformed',
                'reconciliation restore journal is malformed',
              );
            validateRestoreIdentity(
              journal.releaseIdentity,
              'reconciliation restore release',
              proofMode,
              'proof',
            );
            if (!sameIdentity(journal.releaseIdentity, currentIdentity))
              return fail(
                'restore_reconciliation_release_mismatch',
                'reconciliation restore release does not match current metadata',
              );
            if (journal.deploymentAdmission !== 'running_unverified')
              return fail(
                'restore_reconciliation_admission_invalid',
                'reconciliation restore journal admission is invalid',
              );
            if (journal.opsBundleOrigin !== 'current')
              return fail(
                'restore_reconciliation_origin_invalid',
                'only a current operations bundle can reconcile deployment state',
              );
            const adoptedIdentity = journal.unresolvedReleaseIdentity;
            const adoptedState = journal.unresolvedDeploymentState;
            if (
              !exactKeys(adoptedState, standardStateKeys) ||
              adoptedState.schemaVersion !== 1
            )
              return fail(
                'restore_reconciliation_state_malformed',
                'reconciliation unresolved deployment state is malformed',
              );
            validateExitState(adoptedState, 'running_unverified');
            parseCanonicalTimestamp(
              adoptedState.updatedAt,
              'reconciliation unresolved updatedAt',
            );
            if (!deepEqual(adoptedIdentity, identityObject(adoptedState)))
              return fail(
                'restore_reconciliation_identity_mismatch',
                'reconciliation unresolved identity and state disagree',
              );
            validateRestoreIdentity(
              adoptedIdentity,
              'reconciliation unresolved release',
              proofMode,
              deepEqual(adoptedIdentity, currentIdentity)
                ? 'proof'
                : 'unresolved',
            );
            if (rawAllowUnverified !== 'true')
              return fail(
                'restore_reconciliation_admission_required',
                'restore reconciliation requires explicit operator admission',
              );
            admission = 'running_unverified';
            unresolvedIdentity = adoptedIdentity;
            unresolvedState = adoptedState;
          }
        }
      } else {
        validateExitState(state, 'running_unverified');
        if (rawAllowUnverified !== 'true')
          return fail(
            'restore_unverified_admission_required',
            'running_unverified recovery requires explicit operator admission',
          );
        validateRestoreIdentity(
          stateIdentity,
          'unresolved release',
          proofMode,
          sameIdentity(currentIdentity, stateIdentity) ? 'proof' : 'unresolved',
        );
        admission = 'running_unverified';
        unresolvedIdentity = stateIdentity;
        unresolvedState = state;
      }
      updatedAt = parseCanonicalTimestamp(state.updatedAt, 'updatedAt');
    } else if (state.schemaVersion === 2) {
      if (!exactKeys(state, recoveryStateKeys))
        return fail(
          'restore_recovery_state_fields_invalid',
          'recovery deployment state fields are incomplete or unknown',
        );
      validateExitState(state, 'recovering_unverified');
      if (rawAllowUnverified !== 'true')
        return fail(
          'restore_recovering_admission_required',
          'recovering_unverified recovery requires explicit operator admission',
        );
      unresolvedIdentity = state.unresolvedRelease;
      validateRestoreIdentity(
        unresolvedIdentity,
        'unresolved release',
        proofMode,
        deepEqual(unresolvedIdentity, currentIdentity) ? 'proof' : 'unresolved',
      );
      const recoveryTargetTag = deepEqual(state.recoveryTarget, metadata)
        ? 'proof'
        : 'recovery';
      validateRestoreReleaseRecord(
        state.recoveryTarget,
        'recovery target',
        proofMode,
        recoveryTargetTag,
      );
      if (state.rollbackPrevious !== null) {
        validateRestoreReleaseRecord(
          state.rollbackPrevious,
          'rollback previous release',
          proofMode,
          deepEqual(state.rollbackPrevious, metadata) ? 'proof' : 'recovery',
        );
        if (sameIdentity(state.rollbackPrevious, state.recoveryTarget))
          return fail(
            'restore_recovery_previous_collision',
            'rollback previous release and recovery target must differ',
          );
      }
      if (sameIdentity(unresolvedIdentity, state.recoveryTarget))
        return fail(
          'restore_recovery_target_collision',
          'unresolved release and recovery target must differ',
        );
      if (
        !deepEqual(metadata, state.recoveryTarget) &&
        !deepEqual(metadata, state.rollbackPrevious)
      )
        return fail(
          'restore_current_release_not_recovery_bound',
          'current release must exactly match recoveryTarget or rollbackPrevious',
        );
      updatedAt = parseCanonicalTimestamp(state.updatedAt, 'updatedAt');
      admission = 'recovering_unverified';
      unresolvedState = state;
    } else {
      return fail(
        'restore_deployment_state_schema_invalid',
        'deployment state schemaVersion is invalid',
      );
    }
    if (stateIsVerified && updatedAt < deployedAt)
      return fail(
        'restore_deployment_state_predates_release',
        'deployment state predates current release metadata',
      );
    process.stdout.write(
      `${metadata.sourceSha}\n${imageFields
        .map((field) => metadata[field])
        .join('\n')}\n${admission}\n${
        unresolvedIdentity === null ? '-' : canonicalJson(unresolvedIdentity)
      }\n${unresolvedState === null ? '-' : canonicalJson(unresolvedState)}\n`,
    );
  } catch (cause) {
    return fail(
      'restore_authoritative_release_invalid',
      `Authoritative release identity is invalid: ${errorMessage(cause)}.`,
      cause,
    );
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const restoreJournalFields = Object.freeze([
  'schemaVersion',
  'backupBasename',
  'backupSha256',
  'releaseIdentity',
  'publicHealthTarget',
  'opsBundleOrigin',
  'deploymentAdmission',
  'unresolvedReleaseIdentity',
  'unresolvedDeploymentState',
  'targetDatabase',
  'candidateDatabase',
  'quarantineDatabase',
  'resumeServices',
  'phase',
  'updatedAt',
]);
const restorePhases = Object.freeze([
  'preparing',
  'candidate_ready',
  'target_quarantined',
  'candidate_promoted',
  'validated',
  'deployment_reconciling',
  'deployment_reconciled',
  'public_verified',
  'aborting',
]);
const restoreTransitions = Object.freeze({
  preparing: new Set(['preparing', 'candidate_ready', 'aborting']),
  candidate_ready: new Set([
    'candidate_ready',
    'target_quarantined',
    'aborting',
  ]),
  target_quarantined: new Set(['target_quarantined', 'candidate_promoted']),
  candidate_promoted: new Set(['candidate_promoted', 'validated']),
  validated: new Set([
    'validated',
    'deployment_reconciling',
    'public_verified',
  ]),
  deployment_reconciling: new Set([
    'deployment_reconciling',
    'deployment_reconciled',
  ]),
  deployment_reconciled: new Set(['deployment_reconciled', 'public_verified']),
  public_verified: new Set(['public_verified']),
  aborting: new Set(['aborting']),
});
const databaseIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u;

const cleanEpochJournalFields = Object.freeze([
  'schemaVersion',
  'cutoverId',
  'legacyReleaseSha',
  'legacyReleaseIdentity',
  'legacyLedgerSha256',
  'backupBasename',
  'backupSha256',
  'targetReleaseIdentity',
  'targetJournalSha256',
  'targetTreeSha256',
  'targetDatabase',
  'candidateDatabase',
  'quarantineDatabase',
  'pricingSha256',
  'phase',
  'updatedAt',
]);
const cleanEpochPhases = Object.freeze([
  'preparing',
  'candidate_ready',
  'legacy_quarantined',
  'candidate_promoted',
  'validated',
  'public_verified',
  'aborting',
  'aborted',
]);
const cleanEpochTransitions = Object.freeze({
  preparing: new Set(['preparing', 'candidate_ready', 'aborting']),
  candidate_ready: new Set([
    'candidate_ready',
    'legacy_quarantined',
    'aborting',
  ]),
  legacy_quarantined: new Set([
    'legacy_quarantined',
    'candidate_promoted',
    'aborting',
  ]),
  candidate_promoted: new Set(['candidate_promoted', 'validated', 'aborting']),
  validated: new Set(['validated', 'public_verified', 'aborting']),
  public_verified: new Set(['public_verified', 'aborting']),
  aborting: new Set(['aborting']),
  aborted: new Set(),
});

const cleanEpochJournalOperation = (args) => {
  const [
    path,
    evidencePath,
    action,
    cutoverId,
    legacySourceSha,
    legacyApiImage,
    legacyWebImage,
    legacyWorkerImage,
    legacyProcessorImage,
    legacyControlImage,
    legacyLedgerSha256,
    backupBasename,
    backupSha256,
    targetSourceSha,
    apiImage,
    webImage,
    workerImage,
    processorImage,
    controlImage,
    targetJournalSha256,
    targetTreeSha256,
    targetDatabase,
    proposedCandidate,
    proposedQuarantine,
    requestedPhase,
    requestedPricingSha256,
  ] = args;
  const targetReleaseIdentity = {
    releaseFormat: 'five-image-v1',
    sourceSha: targetSourceSha,
    apiImage,
    webImage,
    workerImage,
    processorImage,
    controlImage,
  };
  const legacyReleaseIdentity = {
    releaseFormat: 'five-image-v1',
    sourceSha: legacySourceSha,
    apiImage: legacyApiImage,
    webImage: legacyWebImage,
    workerImage: legacyWorkerImage,
    processorImage: legacyProcessorImage,
    controlImage: legacyControlImage,
  };
  const cutoverIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
  const digestPattern = /^[0-9a-f]{64}$/u;

  const validateInvocationValues = () => {
    if (!cutoverIdPattern.test(cutoverId ?? ''))
      return fail(
        'clean_epoch_cutover_id_invalid',
        'clean epoch cutover ID is invalid',
      );
    if (!shaPattern.test(legacySourceSha ?? ''))
      return fail(
        'clean_epoch_legacy_release_invalid',
        'clean epoch legacy release SHA is invalid',
      );
    validateGhcrIdentity(legacyReleaseIdentity, 'clean epoch legacy release');
    for (const [field, value] of [
      ['legacyLedgerSha256', legacyLedgerSha256],
      ['backupSha256', backupSha256],
      ['targetJournalSha256', targetJournalSha256],
      ['targetTreeSha256', targetTreeSha256],
    ])
      if (!digestPattern.test(value ?? ''))
        return fail(
          'clean_epoch_digest_invalid',
          `clean epoch ${field} is invalid`,
        );
    if (
      !/^pressly-[0-9]{8}T[0-9]{6}Z[.]dump[.]gpg$/u.test(backupBasename ?? '')
    )
      return fail(
        'clean_epoch_backup_basename_invalid',
        'clean epoch backup basename is invalid',
      );
    validateGhcrIdentity(targetReleaseIdentity, 'clean epoch target release');
    for (const database of [
      targetDatabase,
      proposedCandidate,
      proposedQuarantine,
    ])
      if (!databaseIdentifierPattern.test(database ?? ''))
        return fail(
          'clean_epoch_database_invalid',
          'clean epoch database name is invalid',
        );
    if (
      new Set([targetDatabase, proposedCandidate, proposedQuarantine]).size !==
      3
    )
      return fail(
        'clean_epoch_databases_not_distinct',
        'clean epoch database names must be distinct',
      );
    if (
      requestedPricingSha256 !== '-' &&
      !digestPattern.test(requestedPricingSha256 ?? '')
    )
      return fail(
        'clean_epoch_pricing_digest_invalid',
        'clean epoch Pricing digest is invalid',
      );
  };

  const load = () => {
    const value = readStrictObject(path, 'clean epoch journal');
    if (!exactKeys(value, cleanEpochJournalFields))
      return fail(
        'clean_epoch_journal_fields_invalid',
        'clean epoch journal fields are incomplete or unknown',
      );
    if (value.schemaVersion !== 1)
      return fail(
        'clean_epoch_journal_schema_invalid',
        'clean epoch journal schemaVersion is invalid',
      );
    if (!cutoverIdPattern.test(value.cutoverId ?? ''))
      return fail(
        'clean_epoch_journal_id_invalid',
        'clean epoch journal cutover ID is invalid',
      );
    if (!shaPattern.test(value.legacyReleaseSha ?? ''))
      return fail(
        'clean_epoch_journal_legacy_release_invalid',
        'clean epoch journal legacy release SHA is invalid',
      );
    for (const field of [
      'legacyLedgerSha256',
      'backupSha256',
      'targetJournalSha256',
      'targetTreeSha256',
    ])
      if (!digestPattern.test(value[field] ?? ''))
        return fail(
          'clean_epoch_journal_digest_invalid',
          `clean epoch journal ${field} is invalid`,
        );
    if (
      !/^pressly-[0-9]{8}T[0-9]{6}Z[.]dump[.]gpg$/u.test(
        value.backupBasename ?? '',
      )
    )
      return fail(
        'clean_epoch_journal_backup_basename_invalid',
        'clean epoch journal backup basename is invalid',
      );
    validateGhcrIdentity(
      value.legacyReleaseIdentity,
      'clean epoch journal legacy release',
    );
    if (value.legacyReleaseIdentity.sourceSha !== value.legacyReleaseSha)
      return fail(
        'clean_epoch_journal_legacy_identity_mismatch',
        'clean epoch journal legacy release identity does not match its SHA',
      );
    validateGhcrIdentity(
      value.targetReleaseIdentity,
      'clean epoch journal target release',
    );
    for (const field of [
      'targetDatabase',
      'candidateDatabase',
      'quarantineDatabase',
    ])
      if (!databaseIdentifierPattern.test(value[field] ?? ''))
        return fail(
          'clean_epoch_journal_database_invalid',
          `clean epoch journal ${field} is invalid`,
        );
    if (
      new Set([
        value.targetDatabase,
        value.candidateDatabase,
        value.quarantineDatabase,
      ]).size !== 3
    )
      return fail(
        'clean_epoch_journal_databases_not_distinct',
        'clean epoch journal database names must be distinct',
      );
    const prefix = escapeRegex(value.targetDatabase.slice(0, 24));
    if (
      !new RegExp(`^${prefix}_epoch_candidate_[0-9]{14}_[0-9]+$`, 'u').test(
        value.candidateDatabase,
      )
    )
      return fail(
        'clean_epoch_journal_candidate_not_owned',
        'clean epoch candidate database is not cutover-owned',
      );
    if (
      !new RegExp(`^${prefix}_epoch_legacy_[0-9]{14}_[0-9]+$`, 'u').test(
        value.quarantineDatabase,
      )
    )
      return fail(
        'clean_epoch_journal_quarantine_not_owned',
        'clean epoch quarantine database is not cutover-owned',
      );
    if (
      value.pricingSha256 !== null &&
      !digestPattern.test(value.pricingSha256)
    )
      return fail(
        'clean_epoch_journal_pricing_invalid',
        'clean epoch journal Pricing digest is invalid',
      );
    if (!cleanEpochPhases.includes(value.phase))
      return fail(
        'clean_epoch_journal_phase_invalid',
        'clean epoch journal phase is invalid',
      );
    if (
      !new Set(['preparing', 'aborting', 'aborted']).has(value.phase) &&
      value.pricingSha256 === null
    )
      return fail(
        'clean_epoch_journal_pricing_missing',
        'clean epoch journal Pricing digest is missing',
      );
    parseCanonicalTimestamp(value.updatedAt, 'clean epoch journal updatedAt');
    return value;
  };

  const validateInvocation = (value) => {
    const expected = {
      cutoverId,
      legacyReleaseSha: legacySourceSha,
      legacyReleaseIdentity,
      legacyLedgerSha256,
      backupBasename,
      backupSha256,
      targetReleaseIdentity,
      targetJournalSha256,
      targetTreeSha256,
      targetDatabase,
    };
    for (const [field, expectedValue] of Object.entries(expected))
      if (!deepEqual(value[field], expectedValue))
        return fail(
          'clean_epoch_journal_invocation_mismatch',
          `clean epoch journal ${field} does not match this invocation`,
        );
  };

  try {
    validateInvocationValues();
    let journal;
    if (action === 'start') {
      if (existsSync(path)) {
        journal = load();
        validateInvocation(journal);
      } else {
        journal = {
          schemaVersion: 1,
          cutoverId,
          legacyReleaseSha: legacySourceSha,
          legacyReleaseIdentity,
          legacyLedgerSha256,
          backupBasename,
          backupSha256,
          targetReleaseIdentity,
          targetJournalSha256,
          targetTreeSha256,
          targetDatabase,
          candidateDatabase: proposedCandidate,
          quarantineDatabase: proposedQuarantine,
          pricingSha256: null,
          phase: 'preparing',
          updatedAt: currentTimestamp(),
        };
        durableWriteJson(path, journal);
      }
    } else if (action === 'inspect') {
      journal = load();
      validateInvocation(journal);
    } else if (action === 'write') {
      if (!cleanEpochPhases.includes(requestedPhase))
        return fail(
          'clean_epoch_requested_phase_invalid',
          'requested clean epoch phase is invalid',
        );
      journal = load();
      validateInvocation(journal);
      if (
        journal.candidateDatabase !== proposedCandidate ||
        journal.quarantineDatabase !== proposedQuarantine
      )
        return fail(
          'clean_epoch_journal_database_identity_changed',
          'clean epoch journal database identity changed',
        );
      if (!cleanEpochTransitions[journal.phase].has(requestedPhase))
        return fail(
          'clean_epoch_journal_transition_invalid',
          'clean epoch journal phase transition is invalid',
        );
      if (requestedPhase === 'candidate_ready') {
        if (requestedPricingSha256 === '-')
          return fail(
            'clean_epoch_candidate_pricing_required',
            'candidate-ready clean epoch journal requires a Pricing digest',
          );
        journal.pricingSha256 = requestedPricingSha256;
      } else if (
        requestedPricingSha256 !== '-' &&
        journal.pricingSha256 !== requestedPricingSha256
      )
        return fail(
          'clean_epoch_pricing_digest_changed',
          'clean epoch Pricing digest changed after candidate preparation',
        );
      journal.phase = requestedPhase;
      journal.updatedAt = currentTimestamp();
      durableWriteJson(path, journal);
    } else if (action === 'complete') {
      journal = load();
      validateInvocation(journal);
      if (journal.phase !== 'public_verified')
        return fail(
          'clean_epoch_complete_phase_invalid',
          `cannot complete clean epoch cutover from ${journal.phase}`,
        );
      durableWriteJson(evidencePath, journal);
      durableUnlink(path);
      return;
    } else if (action === 'abort') {
      journal = load();
      validateInvocation(journal);
      if (journal.phase !== 'aborting')
        return fail(
          'clean_epoch_abort_phase_invalid',
          `cannot abort clean epoch cutover from ${journal.phase}`,
        );
      const evidence = {
        ...journal,
        phase: 'aborted',
        updatedAt: currentTimestamp(),
      };
      durableWriteJson(evidencePath, evidence);
      durableUnlink(path);
      return;
    } else {
      return fail(
        'clean_epoch_journal_operation_invalid',
        'clean epoch journal operation is invalid',
      );
    }
    process.stdout.write(
      `${journal.phase}\n${journal.candidateDatabase}\n${journal.quarantineDatabase}\n${journal.pricingSha256 ?? '-'}\n`,
    );
  } catch (cause) {
    return fail(
      'clean_epoch_journal_rejected',
      `Clean epoch journal rejected: ${errorMessage(cause)}.`,
      cause,
    );
  }
};

const restoreJournalOperation = (args) => {
  const [
    path,
    evidencePath,
    action,
    backupBasename,
    backupChecksum,
    sourceSha,
    apiImage,
    webImage,
    workerImage,
    processorImage,
    controlImage,
    rawPublicHealthTarget,
    opsBundleOrigin,
    deploymentAdmission,
    rawUnresolvedIdentity,
    rawUnresolvedState,
    targetDatabase,
    proposedCandidate,
    proposedQuarantine,
    rawResumeServices,
    rawAbortMode,
    requestedPhase,
  ] = args;
  const identity = {
    releaseFormat: 'five-image-v1',
    sourceSha,
    apiImage,
    webImage,
    workerImage,
    processorImage,
    controlImage,
  };
  let publicHealthTarget;
  try {
    publicHealthTarget = validatePublicHealthTarget(
      parseStrictObject(
        rawPublicHealthTarget,
        'restore journal public health target',
      ),
      'publicHealthTarget',
    );
  } catch (cause) {
    return fail(
      'restore_journal_public_health_invalid',
      'Restore journal public health target is invalid.',
      cause,
    );
  }
  if (
    !new Set(['verified', 'running_unverified', 'recovering_unverified']).has(
      deploymentAdmission,
    )
  )
    return fail(
      'restore_journal_admission_invalid',
      'Restore journal deployment admission is invalid.',
    );
  if (
    !new Set(['current', 'candidate', 'repository-proof']).has(opsBundleOrigin)
  )
    return fail(
      'restore_journal_ops_origin_invalid',
      'Restore journal operations bundle origin is invalid.',
    );
  let unresolvedIdentity = null;
  if (rawUnresolvedIdentity !== '-') {
    try {
      unresolvedIdentity = parseStrictObject(
        rawUnresolvedIdentity,
        'restore journal unresolved identity',
      );
    } catch (cause) {
      return fail(
        'restore_journal_unresolved_identity_invalid',
        'Restore journal unresolved identity is invalid.',
        cause,
      );
    }
    if (!exactKeys(unresolvedIdentity, identityFields))
      return fail(
        'restore_journal_unresolved_identity_fields_invalid',
        'Restore journal unresolved identity fields are invalid.',
      );
  }
  if ((deploymentAdmission === 'verified') !== (unresolvedIdentity === null))
    return fail(
      'restore_journal_admission_identity_mismatch',
      'Restore journal admission and unresolved identity disagree.',
    );
  let unresolvedState = null;
  if (rawUnresolvedState !== '-') {
    try {
      unresolvedState = parseStrictObject(
        rawUnresolvedState,
        'restore journal unresolved state',
      );
    } catch (cause) {
      return fail(
        'restore_journal_unresolved_state_invalid',
        'Restore journal unresolved state is invalid.',
        cause,
      );
    }
  }
  if ((deploymentAdmission === 'verified') !== (unresolvedState === null))
    return fail(
      'restore_journal_admission_state_mismatch',
      'Restore journal admission and unresolved state disagree.',
    );

  const load = () => {
    const value = readStrictObject(path, 'restore journal');
    if (!exactKeys(value, restoreJournalFields))
      return fail(
        'restore_journal_fields_invalid',
        'restore journal fields are incomplete or unknown',
      );
    if (value.schemaVersion !== 1)
      return fail(
        'restore_journal_schema_invalid',
        'restore journal schemaVersion is invalid',
      );
    if (!exactKeys(value.releaseIdentity, identityFields))
      return fail(
        'restore_journal_release_identity_invalid',
        'restore journal release identity is invalid',
      );
    validatePublicHealthTarget(
      value.publicHealthTarget,
      'restore journal publicHealthTarget',
    );
    if (
      value.unresolvedReleaseIdentity !== null &&
      !exactKeys(value.unresolvedReleaseIdentity, identityFields)
    )
      return fail(
        'restore_journal_stored_unresolved_identity_invalid',
        'restore journal unresolved release identity is invalid',
      );
    if (
      value.unresolvedDeploymentState !== null &&
      !isObject(value.unresolvedDeploymentState)
    )
      return fail(
        'restore_journal_stored_unresolved_state_invalid',
        'restore journal unresolved deployment state is invalid',
      );
    if (
      !new Set(['verified', 'running_unverified', 'recovering_unverified']).has(
        value.deploymentAdmission,
      )
    )
      return fail(
        'restore_journal_stored_admission_invalid',
        'restore journal deployment admission is invalid',
      );
    if (
      !new Set(['current', 'candidate', 'repository-proof']).has(
        value.opsBundleOrigin,
      )
    )
      return fail(
        'restore_journal_stored_origin_invalid',
        'restore journal operations bundle origin is invalid',
      );
    if (
      (value.deploymentAdmission === 'verified') !==
      (value.unresolvedReleaseIdentity === null)
    )
      return fail(
        'restore_journal_stored_admission_identity_mismatch',
        'restore journal admission and unresolved identity disagree',
      );
    if (
      (value.deploymentAdmission === 'verified') !==
      (value.unresolvedDeploymentState === null)
    )
      return fail(
        'restore_journal_stored_admission_state_mismatch',
        'restore journal admission and unresolved state disagree',
      );
    if (!restorePhases.includes(value.phase))
      return fail(
        'restore_journal_phase_invalid',
        'restore journal phase is invalid',
      );
    if (typeof value.resumeServices !== 'boolean')
      return fail(
        'restore_journal_resume_invalid',
        'restore journal resumeServices is invalid',
      );
    for (const field of [
      'targetDatabase',
      'candidateDatabase',
      'quarantineDatabase',
    ]) {
      if (!databaseIdentifierPattern.test(value[field] ?? ''))
        return fail(
          'restore_journal_database_invalid',
          `restore journal ${field} is invalid`,
        );
    }
    if (
      new Set([
        value.targetDatabase,
        value.candidateDatabase,
        value.quarantineDatabase,
      ]).size !== 3
    )
      return fail(
        'restore_journal_databases_not_distinct',
        'restore journal database names must be distinct',
      );
    const recoveryPrefix = value.targetDatabase.slice(0, 24);
    if (
      !new RegExp(
        `^${escapeRegex(recoveryPrefix)}_restore_[0-9]{14}_[0-9]+$`,
        'u',
      ).test(value.candidateDatabase)
    )
      return fail(
        'restore_journal_candidate_not_owned',
        'restore journal candidateDatabase is not recovery-owned',
      );
    if (
      !new RegExp(
        `^${escapeRegex(recoveryPrefix)}_damaged_[0-9]{14}_[0-9]+$`,
        'u',
      ).test(value.quarantineDatabase)
    )
      return fail(
        'restore_journal_quarantine_not_owned',
        'restore journal quarantineDatabase is not recovery-owned',
      );
    parseCanonicalTimestamp(value.updatedAt, 'restore journal updatedAt');
    return value;
  };
  const validateInvocation = (value) => {
    const expected = {
      backupBasename,
      backupSha256: backupChecksum,
      releaseIdentity: identity,
      publicHealthTarget,
      opsBundleOrigin,
      deploymentAdmission,
      unresolvedReleaseIdentity: unresolvedIdentity,
      unresolvedDeploymentState: unresolvedState,
      targetDatabase,
      resumeServices: rawResumeServices === 'true',
    };
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (deepEqual(value[field], expectedValue)) continue;
      if (
        field === 'resumeServices' &&
        rawAbortMode === 'true' &&
        expectedValue === true &&
        value[field] === false
      )
        continue;
      return fail(
        'restore_journal_invocation_mismatch',
        `restore journal ${field} does not match this invocation`,
      );
    }
  };
  try {
    let journal;
    if (action === 'start') {
      if (existsSync(path)) {
        journal = load();
        validateInvocation(journal);
      } else {
        for (const name of [
          targetDatabase,
          proposedCandidate,
          proposedQuarantine,
        ])
          if (!databaseIdentifierPattern.test(name))
            return fail(
              'restore_proposed_database_invalid',
              'proposed restore database name is invalid',
            );
        if (
          new Set([targetDatabase, proposedCandidate, proposedQuarantine])
            .size !== 3
        )
          return fail(
            'restore_proposed_databases_not_distinct',
            'proposed restore database names must be distinct',
          );
        journal = {
          schemaVersion: 1,
          backupBasename,
          backupSha256: backupChecksum,
          releaseIdentity: identity,
          publicHealthTarget,
          opsBundleOrigin,
          deploymentAdmission,
          unresolvedReleaseIdentity: unresolvedIdentity,
          unresolvedDeploymentState: unresolvedState,
          targetDatabase,
          candidateDatabase: proposedCandidate,
          quarantineDatabase: proposedQuarantine,
          resumeServices: rawResumeServices === 'true',
          phase: 'preparing',
          updatedAt: currentTimestamp(),
        };
        durableWriteJson(path, journal);
      }
    } else if (action === 'write') {
      if (!restorePhases.includes(requestedPhase))
        return fail(
          'restore_requested_phase_invalid',
          'requested restore journal phase is invalid',
        );
      journal = load();
      validateInvocation(journal);
      if (
        journal.candidateDatabase !== proposedCandidate ||
        journal.quarantineDatabase !== proposedQuarantine
      )
        return fail(
          'restore_journal_database_identity_changed',
          'restore journal database identity changed',
        );
      if (!restoreTransitions[journal.phase].has(requestedPhase))
        return fail(
          'restore_journal_transition_invalid',
          'restore journal phase transition is invalid',
        );
      if (
        requestedPhase === 'aborting' &&
        rawAbortMode === 'true' &&
        rawResumeServices === 'true'
      )
        journal.resumeServices = true;
      journal.phase = requestedPhase;
      journal.updatedAt = currentTimestamp();
      durableWriteJson(path, journal);
    } else if (action === 'abort' || action === 'remove') {
      journal = load();
      validateInvocation(journal);
      if (
        journal.candidateDatabase !== proposedCandidate ||
        journal.quarantineDatabase !== proposedQuarantine
      )
        return fail(
          'restore_journal_database_identity_changed',
          'restore journal database identity changed',
        );
      if (action === 'abort' && journal.phase !== 'aborting')
        return fail(
          'restore_abort_phase_invalid',
          'cannot retire an abort before target validation',
        );
      if (action === 'remove') {
        const expectedFinalPhase = journal.resumeServices
          ? 'public_verified'
          : 'validated';
        if (journal.phase !== expectedFinalPhase)
          return fail(
            'restore_remove_phase_invalid',
            `cannot remove restore journal from ${journal.phase}`,
          );
      }
      durableWriteJson(evidencePath, journal);
      durableUnlink(path);
      return;
    } else {
      return fail(
        'restore_journal_operation_invalid',
        'restore journal operation is invalid',
      );
    }
    process.stdout.write(
      `${journal.phase}\n${journal.candidateDatabase}\n${journal.quarantineDatabase}\n`,
    );
  } catch (cause) {
    return fail(
      'restore_journal_rejected',
      `Restore journal rejected: ${errorMessage(cause)}.`,
      cause,
    );
  }
};

const reconcileDeploymentState = ([
  metadataPath,
  statePath,
  rawUnresolvedState,
]) => {
  try {
    const metadata = readStrictObject(metadataPath, 'current release metadata');
    const state = readStrictObject(statePath, 'deployment state');
    const unresolvedState = parseStrictObject(
      rawUnresolvedState,
      'journaled unresolved deployment state',
    );
    if (!exactKeys(unresolvedState, standardStateKeys))
      return fail(
        'restore_reconciliation_unresolved_state_malformed',
        'journaled unresolved deployment state is malformed',
      );
    if (!exactKeys(metadata, releaseFields))
      return fail(
        'restore_reconciliation_metadata_malformed',
        'current release metadata is malformed',
      );
    const alreadyVerified =
      exactKeys(state, standardStateKeys) &&
      state.schemaVersion === 1 &&
      state.phase === 'verified' &&
      state.outcome === 'succeeded' &&
      state.exitCode === 0 &&
      sameIdentity(state, metadata);
    if (alreadyVerified) return;
    if (!deepEqual(state, unresolvedState))
      return fail(
        'restore_reconciliation_state_changed',
        'deployment state changed after restore admission; refusing reconciliation',
      );
    durableWriteJson(statePath, {
      schemaVersion: 1,
      ...identityObject(metadata),
      phase: 'verified',
      outcome: 'succeeded',
      exitCode: 0,
      updatedAt: currentTimestamp(),
    });
  } catch (cause) {
    return fail(
      'restore_deployment_state_reconciliation_failed',
      `Deployment-state reconciliation failed: ${errorMessage(cause)}.`,
      cause,
    );
  }
};

const serviceFenceContent = `services:
  api:
    restart: "no"
  worker:
    restart: "no"
  caddy:
    restart: "no"
`;

const ensureServiceFence = ([path]) => {
  const directory = dirname(resolve(path));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (existsSync(path)) {
    const status = lstatSync(path);
    if (!status.isFile() || (status.mode & 0o777) !== 0o600)
      return fail(
        'restore_service_fence_file_invalid',
        'existing recovery service fence is not a mode-600 regular file',
      );
    if (readFileSync(path, 'utf8') !== serviceFenceContent)
      return fail(
        'restore_service_fence_content_invalid',
        'existing recovery service fence has unexpected content',
      );
    return;
  }
  durableWrite(path, serviceFenceContent);
};

const removeServiceFence = ([path]) =>
  durableUnlink(path, 'recovery service fence disappeared before retirement');

const proofWriteFencePhase = ([path, expectedPhase, nextPhase]) => {
  if (expectedPhase === '-') {
    if (existsSync(path))
      return fail(
        'restore_proof_fence_journal_exists',
        'service-fence model journal unexpectedly exists',
      );
  } else {
    const current = readStrictObject(path, 'service-fence model journal');
    if (
      !exactKeys(current, ['schemaVersion', 'phase']) ||
      current.schemaVersion !== 1 ||
      current.phase !== expectedPhase
    )
      return fail(
        'restore_proof_fence_phase_invalid',
        'service-fence model journal phase is invalid',
      );
  }
  durableWriteJson(path, { schemaVersion: 1, phase: nextPhase });
};

const jsonSourceSha = ([raw]) => {
  const value = parseStrictObject(raw, 'unresolved release identity');
  if (typeof value.sourceSha !== 'string' || !shaPattern.test(value.sourceSha))
    return fail(
      'restore_unresolved_source_sha_invalid',
      'unresolved source SHA is invalid',
    );
  process.stdout.write(`${value.sourceSha}\n`);
};

const jsonFileField = ([path, field]) => {
  const value = readStrictObject(path, path);
  if (!(field in value))
    return fail(
      'deployment_json_field_missing',
      `JSON field is missing: ${field}`,
    );
  const fieldValue = value[field];
  if (typeof fieldValue !== 'string')
    return fail(
      'deployment_json_field_invalid',
      `JSON field must be a string: ${field}`,
    );
  process.stdout.write(`${fieldValue}\n`);
};

const jsonFileNestedStringField = ([path, objectField, field]) => {
  const value = readStrictObject(path, path);
  const nested = value[objectField];
  if (!isObject(nested))
    return fail(
      'deployment_json_object_field_invalid',
      `JSON object field is missing or invalid: ${objectField}`,
    );
  const fieldValue = nested[field];
  if (typeof fieldValue !== 'string')
    return fail(
      'deployment_json_nested_field_invalid',
      `JSON nested field must be a string: ${objectField}.${field}`,
    );
  process.stdout.write(`${fieldValue}\n`);
};

const cleanEpochRecoveryAdmission = ([
  currentPointerPath,
  currentMetadataPath,
  previousMetadataPath,
  deploymentStatePath,
  legacySourceSha,
  legacyApiImage,
  legacyWebImage,
  legacyWorkerImage,
  legacyProcessorImage,
  legacyControlImage,
  targetSourceSha,
  targetApiImage,
  targetWebImage,
  targetWorkerImage,
  targetProcessorImage,
  targetControlImage,
]) => {
  if (!shaPattern.test(legacySourceSha ?? ''))
    return fail(
      'clean_epoch_recovery_legacy_sha_invalid',
      'clean epoch recovery legacy release SHA is invalid',
    );
  const legacy = {
    releaseFormat: 'five-image-v1',
    sourceSha: legacySourceSha,
    apiImage: legacyApiImage,
    webImage: legacyWebImage,
    workerImage: legacyWorkerImage,
    processorImage: legacyProcessorImage,
    controlImage: legacyControlImage,
  };
  validateGhcrIdentity(legacy, 'clean epoch recovery legacy release');
  const target = {
    releaseFormat: 'five-image-v1',
    sourceSha: targetSourceSha,
    apiImage: targetApiImage,
    webImage: targetWebImage,
    workerImage: targetWorkerImage,
    processorImage: targetProcessorImage,
    controlImage: targetControlImage,
  };
  validateGhcrIdentity(target, 'clean epoch recovery target release');

  const currentPointer = readFileSync(currentPointerPath, 'utf8');
  if (!/^[0-9a-f]{40}\n$/u.test(currentPointer))
    return fail(
      'clean_epoch_recovery_current_pointer_invalid',
      'clean epoch recovery current release pointer is invalid',
    );
  const currentRelease = readStrictObject(
    currentMetadataPath,
    'clean epoch recovery current release',
  );
  validateReleaseRecord(currentRelease, 'clean epoch recovery current release');

  const deploymentState = readStrictObject(
    deploymentStatePath,
    'clean epoch recovery deployment state',
  );
  const stateKind = validateDeploymentState(deploymentState);
  const currentPointerSha = currentPointer.slice(0, -1);
  const pointerPairMatches = currentPointerSha === currentRelease.sourceSha;
  const exactLegacyCommitTear =
    currentPointerSha === legacySourceSha &&
    sameIdentity(currentRelease, target) &&
    stateKind === 'standard' &&
    new Set(['running_unverified', 'verified']).has(deploymentState.phase) &&
    sameIdentity(deploymentState, target);
  const exactForwardCommitTear =
    currentPointerSha === targetSourceSha &&
    sameIdentity(currentRelease, legacy) &&
    stateKind === 'standard' &&
    deploymentState.phase === 'running_unverified' &&
    sameIdentity(deploymentState, target);
  if (!pointerPairMatches && !exactLegacyCommitTear && !exactForwardCommitTear)
    return fail(
      'clean_epoch_recovery_current_release_mismatch',
      'clean epoch recovery current release pointer and metadata differ outside the exact legacy commit window',
    );
  if (
    pointerPairMatches &&
    stateKind === 'standard' &&
    deploymentState.phase === 'verified' &&
    deploymentState.outcome === 'succeeded' &&
    deploymentState.exitCode === 0 &&
    sameIdentity(currentRelease, legacy) &&
    sameIdentity(currentRelease, deploymentState)
  ) {
    process.stdout.write('legacy_verified\n');
    return;
  }

  let rollbackTarget;
  if (stateKind === 'recovery') {
    rollbackTarget = deploymentState.recoveryTarget;
  } else {
    if (!new Set(['running_unverified', 'verified']).has(deploymentState.phase))
      return fail(
        'clean_epoch_recovery_deployment_phase_invalid',
        `clean epoch recovery cannot continue from deployment phase ${deploymentState.phase}`,
      );
    rollbackTarget = readStrictObject(
      previousMetadataPath,
      'clean epoch recovery rollback release',
    );
    validateReleaseRecord(
      rollbackTarget,
      'clean epoch recovery rollback release',
    );
  }
  if (!sameIdentity(rollbackTarget, legacy))
    return fail(
      'clean_epoch_recovery_rollback_target_mismatch',
      'clean epoch recovery rollback target is not the exact journaled legacy release',
    );
  process.stdout.write('rollback_required\n');
};

const cleanEpochFinalizationAdmission = ([
  journalPath,
  deploymentStatePath,
  targetSourceSha,
  apiImage,
  webImage,
  workerImage,
  processorImage,
  controlImage,
]) => {
  const target = {
    releaseFormat: 'five-image-v1',
    sourceSha: targetSourceSha,
    apiImage,
    webImage,
    workerImage,
    processorImage,
    controlImage,
  };
  validateGhcrIdentity(target, 'clean epoch finalization target');

  const journal = readStrictObject(
    journalPath,
    'clean epoch finalization journal',
  );
  if (
    !exactKeys(journal, cleanEpochJournalFields) ||
    journal.schemaVersion !== 1 ||
    journal.phase !== 'public_verified'
  )
    return fail(
      'clean_epoch_finalization_journal_invalid',
      'clean epoch finalization requires an exact public_verified journal',
    );
  validateGhcrIdentity(
    journal.legacyReleaseIdentity,
    'clean epoch finalization legacy release',
  );
  validateGhcrIdentity(
    journal.targetReleaseIdentity,
    'clean epoch finalization target release',
  );
  if (
    journal.legacyReleaseIdentity.sourceSha !== journal.legacyReleaseSha ||
    !sameIdentity(journal.targetReleaseIdentity, target)
  )
    return fail(
      'clean_epoch_finalization_identity_mismatch',
      'clean epoch finalization journal identity differs from the exact target',
    );

  const deploymentState = readStrictObject(
    deploymentStatePath,
    'clean epoch finalization deployment state',
  );
  const stateKind = validateDeploymentState(deploymentState);
  if (stateKind !== 'standard' || !sameIdentity(deploymentState, target))
    return fail(
      'clean_epoch_finalization_state_mismatch',
      'clean epoch finalization deployment state differs from the exact target',
    );
  if (deploymentState.phase === 'running_unverified') {
    process.stdout.write('resume\n');
    return;
  }
  if (
    deploymentState.phase === 'verified' &&
    deploymentState.outcome === 'succeeded' &&
    deploymentState.exitCode === 0
  ) {
    process.stdout.write('finalize\n');
    return;
  }
  return fail(
    'clean_epoch_finalization_state_invalid',
    'clean epoch finalization state is neither resumable nor verified',
  );
};

const commandHandlers = Object.freeze({
  'clean-epoch-finalization-admission': cleanEpochFinalizationAdmission,
  'clean-epoch-journal-operation': cleanEpochJournalOperation,
  'clean-epoch-recovery-admission': cleanEpochRecoveryAdmission,
  'deployment-state-operation': deploymentStateOperation,
  'durably-install-release-pair': durableInstallReleasePair,
  'ensure-service-fence': ensureServiceFence,
  'health-hostname': ([url]) =>
    process.stdout.write(`${parseHttpsHostname(url)}\n`),
  'host-identity-bindings': hostIdentityBindings,
  'install-ops-bundle': installOpsBundle,
  'json-file-field': jsonFileField,
  'json-file-nested-string-field': jsonFileNestedStringField,
  'json-source-sha': jsonSourceSha,
  'proof-remove-fence-phase': ([path]) => durableUnlink(path),
  'proof-write-fence-phase': proofWriteFencePhase,
  'reconcile-deployment-state': reconcileDeploymentState,
  'release-metadata-preflight': releaseMetadataPreflight,
  'remove-service-fence': removeServiceFence,
  'restore-journal-operation': restoreJournalOperation,
  'restore-release-identity': restoreReleaseIdentity,
  'rollback-release': rollbackRelease,
  'validate-ipv4': ([value]) => {
    if (canonicalIpv4(value) === undefined)
      return fail(
        'deployment_expected_ipv4_invalid',
        'PRESSLY_EXPECTED_PUBLIC_IP must be an IPv4 address.',
      );
  },
});

const main = () => {
  const [command, ...args] = process.argv.slice(2);
  const handler = commandHandlers[command];
  if (handler === undefined)
    return fail(
      'deployment_tooling_command_invalid',
      `Unknown deployment tooling command: ${String(command)}`,
    );
  handler(args);
};

try {
  main();
} catch (error) {
  process.stderr.write(`${errorMessage(error)}\n`);
  process.exitCode = 1;
}
