import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const deploymentTooling = join(
  repositoryRoot,
  'deploy/aws/lightsail/deployment-tooling.mjs',
);
const toolingErrorFactory = join(
  repositoryRoot,
  'platform/errors/src/tooling-error.mjs',
);
const sourceSha = 'a'.repeat(40);
const deployedAt = '2026-08-23T20:00:00Z';
const image = (application, tag = 'proof') =>
  `pressly-restore-proof-unit-${application}:${tag}`;
const releaseIdentity = {
  releaseFormat: 'five-image-v1',
  sourceSha,
  apiImage: image('api'),
  webImage: image('web'),
  workerImage: image('worker'),
  processorImage: image('processor'),
  controlImage: image('control'),
};
const publicHealthTarget = {
  hostIdentity: 'pressly-restore-proof',
  expectedPublicIpv4: '127.0.0.1',
  api: {
    url: 'https://api.restore-proof.invalid/health/ready',
    host: 'api.restore-proof.invalid',
  },
  web: {
    url: 'https://web.restore-proof.invalid/health',
    host: 'web.restore-proof.invalid',
  },
  processor: {
    url: 'https://processor.restore-proof.invalid/health',
    host: 'processor.restore-proof.invalid',
  },
  control: {
    url: 'https://control.restore-proof.invalid/health',
    host: 'control.restore-proof.invalid',
  },
};

const run = (...args) =>
  spawnSync(process.execPath, [deploymentTooling, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PRESSLY_TOOLING_ERROR_FACTORY_PATH: toolingErrorFactory,
    },
  });

describe('dependency-free deployment tooling', () => {
  it('validates the proof host identity and rejects duplicate JSON fields', () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'pressly-node-host-identity-'),
    );
    const path = join(directory, 'host-identity.json');
    try {
      writeFileSync(
        path,
        `${JSON.stringify({
          schemaVersion: 1,
          environment: 'proof',
          publicHealthTarget,
        })}\n`,
      );
      chmodSync(path, 0o600);

      const valid = run('host-identity-bindings', path, 'true');
      expect(valid.status).toBe(0);
      expect(valid.stderr).toBe('');
      expect(valid.stdout.trim().split('\n')).toHaveLength(10);
      expect(valid.stdout).toContain('https://api.restore-proof.invalid');

      writeFileSync(
        path,
        `{"schemaVersion":1,"schemaVersion":1,"environment":"proof","publicHealthTarget":${JSON.stringify(
          publicHealthTarget,
        )}}\n`,
      );
      chmodSync(path, 0o600);
      const duplicate = run('host-identity-bindings', path, 'true');
      expect(duplicate.status).toBe(1);
      expect(duplicate.stderr).toContain('duplicate field');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('derives a verified restore identity and durably advances and retires its journal', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-node-restore-'));
    const pointerPath = join(directory, 'current-release');
    const metadataPath = join(directory, 'current-release.json');
    const statePath = join(directory, 'deployment-state.json');
    const journalPath = join(directory, 'postgres-restore.json');
    const evidencePath = join(directory, 'postgres-restore-last.json');
    const candidate = 'pressly_restore_proof_restore_20260808123456_99999';
    const quarantine = 'pressly_restore_proof_damaged_20260808123456_99999';
    const baseJournalArguments = [
      journalPath,
      evidencePath,
      'pressly-20260823T200000Z.dump.gpg',
      'b'.repeat(64),
      sourceSha,
      releaseIdentity.apiImage,
      releaseIdentity.webImage,
      releaseIdentity.workerImage,
      releaseIdentity.processorImage,
      releaseIdentity.controlImage,
      JSON.stringify(publicHealthTarget),
      'repository-proof',
      'verified',
      '-',
      '-',
      'pressly_restore_proof',
      candidate,
      quarantine,
      'false',
      'false',
    ];
    try {
      writeFileSync(pointerPath, `${sourceSha}\n`);
      writeFileSync(
        metadataPath,
        `${JSON.stringify({ ...releaseIdentity, deployedAt })}\n`,
      );
      writeFileSync(
        statePath,
        `${JSON.stringify({
          schemaVersion: 1,
          ...releaseIdentity,
          phase: 'verified',
          outcome: 'succeeded',
          exitCode: 0,
          updatedAt: deployedAt,
        })}\n`,
      );

      const identity = run(
        'restore-release-identity',
        pointerPath,
        metadataPath,
        statePath,
        journalPath,
        'true',
        'false',
      );
      expect(identity.status).toBe(0);
      expect(identity.stdout.trim().split('\n')).toHaveLength(9);
      expect(identity.stdout).toContain('\nverified\n-\n-\n');

      const start = run(
        'restore-journal-operation',
        ...baseJournalArguments.slice(0, 2),
        'start',
        ...baseJournalArguments.slice(2),
        'preparing',
      );
      expect(start.status).toBe(0);
      expect(start.stdout).toBe(`preparing\n${candidate}\n${quarantine}\n`);
      expect(statSync(journalPath).mode & 0o777).toBe(0o600);

      for (const phase of [
        'candidate_ready',
        'target_quarantined',
        'candidate_promoted',
        'validated',
      ]) {
        const write = run(
          'restore-journal-operation',
          ...baseJournalArguments.slice(0, 2),
          'write',
          ...baseJournalArguments.slice(2),
          phase,
        );
        expect(write.status, write.stderr).toBe(0);
      }

      const remove = run(
        'restore-journal-operation',
        ...baseJournalArguments.slice(0, 2),
        'remove',
        ...baseJournalArguments.slice(2),
        'validated',
      );
      expect(remove.status, remove.stderr).toBe(0);
      expect(existsSync(journalPath)).toBe(false);
      expect(JSON.parse(readFileSync(evidencePath, 'utf8'))).toMatchObject({
        phase: 'validated',
        releaseIdentity,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('creates, validates, and durably retires the service fence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-node-fence-'));
    const path = join(directory, 'postgres-restore-fence.compose.yml');
    try {
      const ensure = run('ensure-service-fence', path);
      expect(ensure.status, ensure.stderr).toBe(0);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(readFileSync(path, 'utf8')).toContain('restart: "no"');
      expect(run('ensure-service-fence', path).status).toBe(0);
      expect(run('remove-service-fence', path).status).toBe(0);
      expect(existsSync(path)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
