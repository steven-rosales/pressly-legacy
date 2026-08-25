import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const deploymentTooling = join(
  root,
  'deploy/aws/lightsail/deployment-tooling.mjs',
);
const toolingErrorFactory = join(root, 'platform/errors/src/tooling-error.mjs');
const sourceSha = 'a'.repeat(40);
const legacySha = 'b'.repeat(40);
const digest = (character) => character.repeat(64);
const image = (application, character) =>
  `ghcr.io/pressly-proof/${application}@sha256:${digest(character)}`;

const run = (...args) =>
  spawnSync(process.execPath, [deploymentTooling, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PRESSLY_TOOLING_ERROR_FACTORY_PATH: toolingErrorFactory,
    },
  });

describe('clean database epoch deployment evidence', () => {
  it('keeps the destructive path explicit, fenced, and candidate-based', () => {
    const deploy = readFileSync(
      join(root, 'deploy/aws/lightsail/deploy.sh'),
      'utf8',
    );
    const cutover = readFileSync(
      join(root, 'deploy/aws/lightsail/cutover-clean-epoch.sh'),
      'utf8',
    );
    const backup = readFileSync(
      join(root, 'deploy/aws/lightsail/backup-postgres.sh'),
      'utf8',
    );
    const rollback = readFileSync(
      join(root, 'deploy/aws/lightsail/rollback.sh'),
      'utf8',
    );
    const legacyOverride = readFileSync(
      join(
        root,
        'deploy/aws/lightsail/clean-epoch-legacy-compose.override.yml',
      ),
      'utf8',
    );
    const recovery = readFileSync(
      join(root, 'deploy/aws/lightsail/recover-clean-epoch.sh'),
      'utf8',
    );

    expect(deploy).toContain('--clean-epoch-cutover');
    expect(deploy).toContain('clean-epoch-finalization-admission');
    expect(deploy).toContain('clean_epoch_resume_admission');
    expect(deploy).toContain('"$CLEAN_EPOCH_SCRIPT" prepare');
    expect(deploy).toContain('"$CLEAN_EPOCH_SCRIPT" mark-public-verified');
    expect(deploy).toContain('"$CLEAN_EPOCH_SCRIPT" finalize');
    expect(deploy).toContain(
      'runtime_compose_files+=(-f "$CLEAN_EPOCH_FENCE_FILE")',
    );
    expect(deploy).toContain('"${runtime_compose_files[@]}"');
    expect(cutover).toContain('--template=template0');
    expect(cutover).toContain('compose stop caddy api worker');
    expect(cutover).toContain(
      'compose ps --all --quiet migrate backup restore',
    );
    expect(cutover).toContain('docker rm --force "${tool_container_ids[@]}"');
    expect(cutover).toContain('clean-epoch-journal-operation');
    expect(cutover).toContain('prepare-clean-epoch-candidate.ts');
    expect(cutover).toContain('PRESSLY_BACKUP_LOCK_HELD=true');
    expect(cutover).toContain('PRESSLY_BACKUP_SECONDARY_S3_URI');
    expect(cutover).toContain('PRESSLY_BACKUP_LOCAL_ONLY=false');
    expect(cutover).not.toContain('PRESSLY_BACKUP_LOCAL_ONLY=true');
    expect(cutover).toContain('verify_database_roles');
    expect(cutover).toContain('PRESSLY_PREVIOUS_RELEASE_METADATA_FILE');
    expect(cutover).toContain('LEGACY_API_IMAGE');
    expect(cutover).toContain('LEGACY_CONTROL_IMAGE');
    expect(cutover).toContain(
      'PRESSLY_CLEAN_EPOCH_EXPECTED_PRICING_SHA256="$PRICING_SHA256"',
    );
    expect(cutover).not.toMatch(
      /ALLOW_CONNECTIONS true[^\n]*quarantine_database/u,
    );
    expect(cutover).toContain('ALTER DATABASE %I RENAME TO %I');
    expect(cutover).toContain('Legacy database retained:');
    expect(cutover).not.toMatch(/dropdb[^\n]*QUARANTINE_DATABASE/u);
    expect(backup).toContain('PRESSLY_BACKUP_LOCAL_ONLY');
    expect(backup).toContain('PRESSLY_BACKUP_LOCK_HELD');
    expect(backup).toContain('if [[ "$LOCAL_ONLY" == false ]]');
    expect(rollback).toContain(
      'Application-only rollback across the clean database epoch is forbidden.',
    );
    expect(legacyOverride).toContain(
      'PRESSLY_CLEAN_EPOCH_LEGACY_WEB_CACHE_PATH',
    );
    expect(legacyOverride).toContain('disable: true');
    expect(legacyOverride).not.toContain('read_only: false');
    expect(legacyOverride).not.toMatch(/(?:apps|infra|modules|packages)\//u);
    expect(recovery).toContain('derive_legacy_web_cache_path');
    expect(recovery).toContain('verify_legacy_worker_health');
  });

  it('materializes the exact restart-no override consumed by clean-epoch deploy', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-clean-epoch-'));
    const fence = join(directory, 'fence.yml');
    try {
      const result = run('ensure-service-fence', fence);
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(fence, 'utf8')).toBe(`services:
  api:
    restart: "no"
  worker:
    restart: "no"
  caddy:
    restart: "no"
`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('durably binds one exact candidate, Pricing digest, and phase sequence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-clean-epoch-'));
    const journal = join(directory, 'journal.json');
    const evidence = join(directory, 'evidence.json');
    const candidate = 'pressly_epoch_candidate_20260825010101_1234';
    const quarantine = 'pressly_epoch_legacy_20260825010101_1234';
    const base = [
      journal,
      evidence,
      'pre-user-clean-owner-epoch-v1',
      legacySha,
      image('api', '6'),
      image('web', '7'),
      image('worker', '8'),
      image('processor', '9'),
      image('control', 'a'),
      digest('c'),
      'pressly-20260825T010101Z.dump.gpg',
      digest('d'),
      sourceSha,
      image('api', '1'),
      image('web', '2'),
      image('worker', '3'),
      image('processor', '4'),
      image('control', '5'),
      digest('e'),
      digest('f'),
      'pressly',
      candidate,
      quarantine,
    ];
    try {
      const start = run(
        'clean-epoch-journal-operation',
        ...base.slice(0, 2),
        'start',
        ...base.slice(2),
        'preparing',
        '-',
      );
      expect(start.status).toBe(0);
      expect(start.stderr).toBe('');
      expect(start.stdout).toBe(`preparing\n${candidate}\n${quarantine}\n-\n`);

      const pricingSha256 = digest('6');
      for (const phase of [
        'candidate_ready',
        'legacy_quarantined',
        'candidate_promoted',
        'validated',
        'public_verified',
      ]) {
        const write = run(
          'clean-epoch-journal-operation',
          ...base.slice(0, 2),
          'write',
          ...base.slice(2),
          phase,
          pricingSha256,
        );
        expect(write.status, write.stderr).toBe(0);
      }

      const complete = run(
        'clean-epoch-journal-operation',
        ...base.slice(0, 2),
        'complete',
        ...base.slice(2),
        'public_verified',
        pricingSha256,
      );
      expect(complete.status).toBe(0);
      expect(existsSync(journal)).toBe(false);
      expect(JSON.parse(readFileSync(evidence, 'utf8'))).toMatchObject({
        cutoverId: 'pre-user-clean-owner-epoch-v1',
        legacyReleaseSha: legacySha,
        legacyReleaseIdentity: { sourceSha: legacySha },
        backupSha256: digest('d'),
        pricingSha256,
        phase: 'public_verified',
        targetReleaseIdentity: { sourceSha },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a changed target and phase skips without changing evidence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-clean-epoch-'));
    const journal = join(directory, 'journal.json');
    const evidence = join(directory, 'evidence.json');
    const candidate = 'pressly_epoch_candidate_20260825010101_1234';
    const quarantine = 'pressly_epoch_legacy_20260825010101_1234';
    const base = [
      journal,
      evidence,
      'pre-user-clean-owner-epoch-v1',
      legacySha,
      image('api', '6'),
      image('web', '7'),
      image('worker', '8'),
      image('processor', '9'),
      image('control', 'a'),
      digest('c'),
      'pressly-20260825T010101Z.dump.gpg',
      digest('d'),
      sourceSha,
      image('api', '1'),
      image('web', '2'),
      image('worker', '3'),
      image('processor', '4'),
      image('control', '5'),
      digest('e'),
      digest('f'),
      'pressly',
      candidate,
      quarantine,
    ];
    try {
      expect(
        run(
          'clean-epoch-journal-operation',
          ...base.slice(0, 2),
          'start',
          ...base.slice(2),
          'preparing',
          '-',
        ).status,
      ).toBe(0);

      const skipped = run(
        'clean-epoch-journal-operation',
        ...base.slice(0, 2),
        'write',
        ...base.slice(2),
        'candidate_promoted',
        digest('6'),
      );
      expect(skipped.status).toBe(1);
      expect(skipped.stderr).toContain('phase transition is invalid');

      const changed = [...base];
      changed[12] = '7'.repeat(40);
      const mismatch = run(
        'clean-epoch-journal-operation',
        ...changed.slice(0, 2),
        'start',
        ...changed.slice(2),
        'preparing',
        '-',
      );
      expect(mismatch.status).toBe(1);
      expect(mismatch.stderr).toContain('does not match this invocation');
      expect(existsSync(evidence)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
