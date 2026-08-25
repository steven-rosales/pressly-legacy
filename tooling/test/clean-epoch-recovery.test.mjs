import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const deploymentTooling = join(
  root,
  'deploy/aws/lightsail/deployment-tooling.mjs',
);
const toolingErrorFactory = join(root, 'platform/errors/src/tooling-error.mjs');
const legacySha = 'a'.repeat(40);
const targetSha = 'b'.repeat(40);
const digest = (character) => character.repeat(64);
const image = (application, character) =>
  `ghcr.io/pressly-recovery/${application}@sha256:${digest(character)}`;
const legacyIdentity = Object.freeze({
  releaseFormat: 'five-image-v1',
  sourceSha: legacySha,
  apiImage: image('api', '1'),
  webImage: image('web', '2'),
  workerImage: image('worker', '3'),
  processorImage: image('processor', '4'),
  controlImage: image('control', '5'),
});
const targetIdentity = Object.freeze({
  releaseFormat: 'five-image-v1',
  sourceSha: targetSha,
  apiImage: image('api', '6'),
  webImage: image('web', '7'),
  workerImage: image('worker', '8'),
  processorImage: image('processor', '9'),
  controlImage: image('control', 'a'),
});
const deployedAt = '2026-08-25T06:00:00Z';
const updatedAt = '2026-08-25T06:01:00Z';
const directories = [];

const run = (...args) =>
  spawnSync(process.execPath, [deploymentTooling, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PRESSLY_TOOLING_ERROR_FACTORY_PATH: toolingErrorFactory,
    },
  });

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'pressly-epoch-recovery-'));
  directories.push(directory);
  return {
    directory,
    journal: join(directory, 'journal.json'),
    evidence: join(directory, 'evidence.json'),
    currentPointer: join(directory, 'current-release'),
    currentMetadata: join(directory, 'current-release.json'),
    previousMetadata: join(directory, 'previous-release.json'),
    deploymentState: join(directory, 'deployment-state.json'),
  };
};

const journalArgs = (paths, action, phase = '-', pricing = '-') => [
  'clean-epoch-journal-operation',
  paths.journal,
  paths.evidence,
  action,
  'clean-owner-epoch-v1',
  legacyIdentity.sourceSha,
  legacyIdentity.apiImage,
  legacyIdentity.webImage,
  legacyIdentity.workerImage,
  legacyIdentity.processorImage,
  legacyIdentity.controlImage,
  digest('c'),
  'pressly-20260825T060000Z.dump.gpg',
  digest('d'),
  targetIdentity.sourceSha,
  targetIdentity.apiImage,
  targetIdentity.webImage,
  targetIdentity.workerImage,
  targetIdentity.processorImage,
  targetIdentity.controlImage,
  digest('e'),
  digest('f'),
  'pressly',
  'pressly_epoch_candidate_20260825060000_1234',
  'pressly_epoch_legacy_20260825060000_1234',
  phase,
  pricing,
];

const expectSuccess = (result) => {
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
};

const advanceTo = (paths, phase) => {
  expectSuccess(run(...journalArgs(paths, 'start', 'preparing')));
  if (phase === 'preparing') return;
  expectSuccess(
    run(...journalArgs(paths, 'write', 'candidate_ready', digest('0'))),
  );
  if (phase === 'candidate_ready') return;
  expectSuccess(run(...journalArgs(paths, 'write', 'legacy_quarantined')));
  if (phase === 'legacy_quarantined') return;
  expectSuccess(run(...journalArgs(paths, 'write', 'candidate_promoted')));
  if (phase === 'candidate_promoted') return;
  expectSuccess(run(...journalArgs(paths, 'write', 'validated')));
  if (phase === 'validated') return;
  expectSuccess(run(...journalArgs(paths, 'write', 'public_verified')));
};

const writeRelease = (path, identity) =>
  writeFileSync(path, `${JSON.stringify({ ...identity, deployedAt })}\n`);

const writeState = (path, identity, phase, outcome, exitCode) =>
  writeFileSync(
    path,
    `${JSON.stringify({
      schemaVersion: 1,
      ...identity,
      phase,
      outcome,
      exitCode,
      updatedAt,
    })}\n`,
  );

afterEach(() => {
  while (directories.length > 0) rmSync(directories.pop(), { recursive: true });
});

describe('clean database epoch recovery journal', () => {
  for (const phase of [
    'preparing',
    'candidate_ready',
    'legacy_quarantined',
    'candidate_promoted',
    'validated',
    'public_verified',
  ]) {
    it(`durably aborts from ${phase}`, () => {
      const paths = fixture();
      advanceTo(paths, phase);

      expectSuccess(run(...journalArgs(paths, 'write', 'aborting')));
      expect(JSON.parse(readFileSync(paths.journal, 'utf8'))).toMatchObject({
        phase: 'aborting',
        legacyReleaseIdentity: legacyIdentity,
        targetReleaseIdentity: targetIdentity,
      });

      expectSuccess(run(...journalArgs(paths, 'abort', 'aborted')));
      expect(existsSync(paths.journal)).toBe(false);
      expect(JSON.parse(readFileSync(paths.evidence, 'utf8'))).toMatchObject({
        phase: 'aborted',
        legacyReleaseIdentity: legacyIdentity,
        targetReleaseIdentity: targetIdentity,
      });
    });
  }

  it('rejects an abort whose exact legacy identity changed', () => {
    const paths = fixture();
    advanceTo(paths, 'candidate_ready');
    expectSuccess(run(...journalArgs(paths, 'write', 'aborting')));
    const mismatched = journalArgs(paths, 'abort', 'aborted');
    mismatched[6] = image('api', 'b');

    const result = run(...mismatched);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'clean epoch journal legacyReleaseIdentity',
    );
    expect(existsSync(paths.journal)).toBe(true);
    expect(existsSync(paths.evidence)).toBe(false);
  });
});

describe('clean database epoch release admission', () => {
  it('recognizes exact verified legacy state after rollback rotation', () => {
    const paths = fixture();
    writeFileSync(paths.currentPointer, `${legacySha}\n`);
    writeRelease(paths.currentMetadata, legacyIdentity);
    writeRelease(paths.previousMetadata, targetIdentity);
    writeState(
      paths.deploymentState,
      legacyIdentity,
      'verified',
      'succeeded',
      0,
    );

    const result = run(
      'clean-epoch-recovery-admission',
      paths.currentPointer,
      paths.currentMetadata,
      paths.previousMetadata,
      paths.deploymentState,
      legacySha,
      legacyIdentity.apiImage,
      legacyIdentity.webImage,
      legacyIdentity.workerImage,
      legacyIdentity.processorImage,
      legacyIdentity.controlImage,
      targetIdentity.sourceSha,
      targetIdentity.apiImage,
      targetIdentity.webImage,
      targetIdentity.workerImage,
      targetIdentity.processorImage,
      targetIdentity.controlImage,
    );

    expectSuccess(result);
    expect(result.stdout).toBe('legacy_verified\n');
  });

  it('requires the exact journaled legacy rollback target', () => {
    const paths = fixture();
    writeFileSync(paths.currentPointer, `${targetSha}\n`);
    writeRelease(paths.currentMetadata, targetIdentity);
    writeRelease(paths.previousMetadata, legacyIdentity);
    writeState(
      paths.deploymentState,
      targetIdentity,
      'running_unverified',
      'failed',
      1,
    );

    const admitted = run(
      'clean-epoch-recovery-admission',
      paths.currentPointer,
      paths.currentMetadata,
      paths.previousMetadata,
      paths.deploymentState,
      legacySha,
      legacyIdentity.apiImage,
      legacyIdentity.webImage,
      legacyIdentity.workerImage,
      legacyIdentity.processorImage,
      legacyIdentity.controlImage,
      targetIdentity.sourceSha,
      targetIdentity.apiImage,
      targetIdentity.webImage,
      targetIdentity.workerImage,
      targetIdentity.processorImage,
      targetIdentity.controlImage,
    );
    expectSuccess(admitted);
    expect(admitted.stdout).toBe('rollback_required\n');

    const rejected = run(
      'clean-epoch-recovery-admission',
      paths.currentPointer,
      paths.currentMetadata,
      paths.previousMetadata,
      paths.deploymentState,
      'c'.repeat(40),
      legacyIdentity.apiImage,
      legacyIdentity.webImage,
      legacyIdentity.workerImage,
      legacyIdentity.processorImage,
      legacyIdentity.controlImage,
      targetIdentity.sourceSha,
      targetIdentity.apiImage,
      targetIdentity.webImage,
      targetIdentity.workerImage,
      targetIdentity.processorImage,
      targetIdentity.controlImage,
    );
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain(
      'rollback target is not the exact journaled legacy release',
    );
  });

  it('resumes the exact pointer-first legacy metadata commit tear', () => {
    const paths = fixture();
    writeFileSync(paths.currentPointer, `${legacySha}\n`);
    writeRelease(paths.currentMetadata, targetIdentity);
    writeRelease(paths.previousMetadata, legacyIdentity);
    writeState(
      paths.deploymentState,
      targetIdentity,
      'verified',
      'succeeded',
      0,
    );

    const result = run(
      'clean-epoch-recovery-admission',
      paths.currentPointer,
      paths.currentMetadata,
      paths.previousMetadata,
      paths.deploymentState,
      legacySha,
      legacyIdentity.apiImage,
      legacyIdentity.webImage,
      legacyIdentity.workerImage,
      legacyIdentity.processorImage,
      legacyIdentity.controlImage,
      targetIdentity.sourceSha,
      targetIdentity.apiImage,
      targetIdentity.webImage,
      targetIdentity.workerImage,
      targetIdentity.processorImage,
      targetIdentity.controlImage,
    );

    expectSuccess(result);
    expect(result.stdout).toBe('rollback_required\n');
  });

  it('resumes the exact forward pointer-first metadata commit tear', () => {
    const paths = fixture();
    writeFileSync(paths.currentPointer, `${targetSha}\n`);
    writeRelease(paths.currentMetadata, legacyIdentity);
    writeRelease(paths.previousMetadata, legacyIdentity);
    writeState(
      paths.deploymentState,
      targetIdentity,
      'running_unverified',
      'failed',
      137,
    );

    const result = run(
      'clean-epoch-recovery-admission',
      paths.currentPointer,
      paths.currentMetadata,
      paths.previousMetadata,
      paths.deploymentState,
      legacySha,
      legacyIdentity.apiImage,
      legacyIdentity.webImage,
      legacyIdentity.workerImage,
      legacyIdentity.processorImage,
      legacyIdentity.controlImage,
      targetIdentity.sourceSha,
      targetIdentity.apiImage,
      targetIdentity.webImage,
      targetIdentity.workerImage,
      targetIdentity.processorImage,
      targetIdentity.controlImage,
    );

    expectSuccess(result);
    expect(result.stdout).toBe('rollback_required\n');
  });

  it('rejects a same-SHA legacy record with any different image digest', () => {
    const paths = fixture();
    writeFileSync(paths.currentPointer, `${targetSha}\n`);
    writeRelease(paths.currentMetadata, targetIdentity);
    writeRelease(paths.previousMetadata, {
      ...legacyIdentity,
      apiImage: image('api', 'b'),
    });
    writeState(
      paths.deploymentState,
      targetIdentity,
      'running_unverified',
      'failed',
      1,
    );

    const result = run(
      'clean-epoch-recovery-admission',
      paths.currentPointer,
      paths.currentMetadata,
      paths.previousMetadata,
      paths.deploymentState,
      legacySha,
      legacyIdentity.apiImage,
      legacyIdentity.webImage,
      legacyIdentity.workerImage,
      legacyIdentity.processorImage,
      legacyIdentity.controlImage,
      targetIdentity.sourceSha,
      targetIdentity.apiImage,
      targetIdentity.webImage,
      targetIdentity.workerImage,
      targetIdentity.processorImage,
      targetIdentity.controlImage,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'rollback target is not the exact journaled legacy release',
    );
  });
});

describe('clean database epoch finalization kill window', () => {
  it('admits both exact resumable and already-verified target state', () => {
    const paths = fixture();
    advanceTo(paths, 'public_verified');
    const args = [
      'clean-epoch-finalization-admission',
      paths.journal,
      paths.deploymentState,
      targetIdentity.sourceSha,
      targetIdentity.apiImage,
      targetIdentity.webImage,
      targetIdentity.workerImage,
      targetIdentity.processorImage,
      targetIdentity.controlImage,
    ];

    writeState(
      paths.deploymentState,
      targetIdentity,
      'running_unverified',
      'failed',
      137,
    );
    const resumable = run(...args);
    expectSuccess(resumable);
    expect(resumable.stdout).toBe('resume\n');

    writeState(
      paths.deploymentState,
      targetIdentity,
      'verified',
      'succeeded',
      0,
    );
    const finalizable = run(...args);
    expectSuccess(finalizable);
    expect(finalizable.stdout).toBe('finalize\n');
  });

  it('rejects a verified state for any other immutable target', () => {
    const paths = fixture();
    advanceTo(paths, 'public_verified');
    writeState(
      paths.deploymentState,
      legacyIdentity,
      'verified',
      'succeeded',
      0,
    );

    const result = run(
      'clean-epoch-finalization-admission',
      paths.journal,
      paths.deploymentState,
      targetIdentity.sourceSha,
      targetIdentity.apiImage,
      targetIdentity.webImage,
      targetIdentity.workerImage,
      targetIdentity.processorImage,
      targetIdentity.controlImage,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'deployment state differs from the exact target',
    );
  });
});
