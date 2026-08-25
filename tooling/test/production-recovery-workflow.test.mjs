import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const workflowPath = resolve(root, '.github/workflows/deploy-production.yml');
const guardPath = resolve(
  root,
  'tooling/scripts/production-recovery-guard.mjs',
);
const workflowSource = readFileSync(workflowPath, 'utf8');
const workflow = parse(workflowSource);
const deployJob = workflow.jobs.deploy;
const workflowSteps = deployJob.steps;
const workflowStep = (name) =>
  workflowSteps.find((candidate) => candidate.name === name);

const currentSha = 'f'.repeat(40);
const unverifiedSha = '1'.repeat(40);
const otherSha = '2'.repeat(40);
const timestamp = '2026-08-25T05:13:25Z';
const image = (application, digest) =>
  `ghcr.io/example/pressly/${application}@sha256:${digest.repeat(64)}`;
const releaseImages = Object.freeze({
  apiImage: image('api', 'a'),
  webImage: image('web', 'b'),
  workerImage: image('worker', 'c'),
  processorImage: image('processor', 'd'),
  controlImage: image('control', 'e'),
});
const unverifiedImages = Object.freeze({
  apiImage: image('api', '1'),
  webImage: image('web', '2'),
  workerImage: image('worker', '3'),
  processorImage: image('processor', '4'),
  controlImage: image('control', '5'),
});
const release = (sourceSha = currentSha, images = releaseImages) => ({
  releaseFormat: 'five-image-v1',
  sourceSha,
  ...images,
  deployedAt: timestamp,
});
const failedState = () => ({
  schemaVersion: 1,
  releaseFormat: 'five-image-v1',
  sourceSha: unverifiedSha,
  ...unverifiedImages,
  phase: 'running_unverified',
  outcome: 'failed',
  exitCode: 1,
  updatedAt: timestamp,
});
const verifiedState = () => ({
  schemaVersion: 1,
  releaseFormat: 'five-image-v1',
  sourceSha: currentSha,
  ...releaseImages,
  phase: 'verified',
  outcome: 'succeeded',
  exitCode: 0,
  updatedAt: timestamp,
});

const writeMode600 = (path, value) => {
  writeFileSync(path, value);
  chmodSync(path, 0o600);
};

const writeJson = (path, value) =>
  writeMode600(path, `${JSON.stringify(value)}\n`);

const createRecoveryFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'pressly-recovery-guard-'));
  const opsRoot = join(directory, 'ops');
  const releaseDirectory = join(opsRoot, 'releases', currentSha);
  mkdirSync(releaseDirectory, { recursive: true });
  const rollback = join(releaseDirectory, 'rollback.sh');
  writeFileSync(rollback, '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(rollback, 0o700);
  writeMode600(join(releaseDirectory, 'source-sha'), `${currentSha}\n`);
  symlinkSync(join('releases', currentSha), join(opsRoot, 'current'));

  const paths = {
    state: join(directory, 'deployment-state.json'),
    currentPointer: join(directory, 'current-release'),
    currentMetadata: join(directory, 'current-release.json'),
    previousPointer: join(directory, 'previous-release'),
    previousMetadata: join(directory, 'previous-release.json'),
    opsCurrent: join(opsRoot, 'current'),
  };
  writeJson(paths.state, failedState());
  writeMode600(paths.currentPointer, `${currentSha}\n`);
  writeJson(paths.currentMetadata, release());
  writeMode600(paths.previousPointer, `${currentSha}\n`);
  writeJson(paths.previousMetadata, release());
  return { directory, paths };
};

const runGuard = (fixture, mode, overrides = {}) =>
  spawnSync(
    process.execPath,
    [
      guardPath,
      mode,
      overrides.expectedCurrentSha ?? currentSha,
      overrides.expectedUnverifiedSha ?? unverifiedSha,
      fixture.paths.state,
      fixture.paths.currentPointer,
      fixture.paths.currentMetadata,
      fixture.paths.previousPointer,
      fixture.paths.previousMetadata,
      overrides.checkoutSha ?? currentSha,
      fixture.paths.opsCurrent,
    ],
    { encoding: 'utf8' },
  );

const runAdmission = (environment) => {
  const output = join(
    mkdtempSync(join(tmpdir(), 'pressly-deployment-admission-')),
    'output',
  );
  const result = spawnSync(
    'bash',
    ['-c', workflowStep('Validate deployment admission').run],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        EVENT_NAME: '',
        REQUESTED_OPERATION: '',
        PRODUCTION_DEPLOYMENT_ADMISSION: '',
        EXPECTED_CURRENT_SHA: '',
        EXPECTED_UNVERIFIED_SHA: '',
        RECOVERY_CONFIRMATION: '',
        MANUAL_SHA: '',
        GITHUB_OUTPUT: output,
        ...environment,
      },
    },
  );
  return {
    ...result,
    output: result.status === 0 ? readFileSync(output, 'utf8') : '',
  };
};

describe('production deployment workflow admission', () => {
  it('parses and exposes only explicit deploy and maintenance operations', () => {
    const inputs = workflow.on.workflow_dispatch.inputs;

    expect(inputs.operation).toMatchObject({
      required: true,
      default: 'deploy',
      type: 'choice',
      options: [
        'deploy',
        'reconcile-rollback',
        'clean-epoch',
        'resume-clean-epoch',
        'recover-clean-epoch',
      ],
    });
    for (const name of [
      'ref',
      'expected_current_sha',
      'expected_unverified_sha',
      'confirmation',
    ])
      expect(inputs[name]).toBeDefined();
    expect(deployJob.environment).toBe('production');
  });

  it('admits automatic deployment only when production is explicitly open', () => {
    expect(deployJob.if).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(deployJob.if).not.toContain(
      "vars.PRODUCTION_DEPLOYMENT_ADMISSION == 'open'",
    );

    const admission = workflowStep('Validate deployment admission');
    expect(admission.env.PRODUCTION_DEPLOYMENT_ADMISSION).toBe(
      '${{ vars.PRODUCTION_DEPLOYMENT_ADMISSION }}',
    );
    expect(admission.run).toContain('open | paused');
    expect(admission.run).toContain(
      'PRODUCTION_DEPLOYMENT_ADMISSION must be exactly open or paused.',
    );

    const paused = runAdmission({
      EVENT_NAME: 'workflow_run',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'paused',
    });
    expect(paused.status, paused.stderr).toBe(0);
    expect(paused.output).toBe('operation=skip\n');

    const open = runAdmission({
      EVENT_NAME: 'workflow_run',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'open',
    });
    expect(open.status, open.stderr).toBe(0);
    expect(open.output).toBe('operation=deploy\n');

    for (const stepName of [
      'Checkout deployment tooling',
      'Resolve deploy ref',
      'Resolve successful CI run',
      'Checkout deployed release tooling',
      'Download verified release evidence',
      'Validate immutable release manifest',
      'Install SSH key',
      'Install verified Lightsail host key',
      'Reconcile pinned Lightsail Node runtime',
    ])
      expect(workflowStep(stepName).if).toContain(
        "steps.deployment-admission.outputs.operation != 'skip'",
      );
    expect(workflowStep('Report deployment result').run).toContain(
      'if [[ "$OPERATION" == \'skip\' ]]',
    );
  });

  it('refuses manual deploy while paused and admits exact manual reconciliation', () => {
    const refused = runAdmission({
      EVENT_NAME: 'workflow_dispatch',
      REQUESTED_OPERATION: 'deploy',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'paused',
    });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(
      'Manual deployment is refused while production admission is paused.',
    );

    const confirmation = `RECONCILE_ROLLBACK:${unverifiedSha}:${currentSha}`;
    const admitted = runAdmission({
      EVENT_NAME: 'workflow_dispatch',
      REQUESTED_OPERATION: 'reconcile-rollback',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'paused',
      EXPECTED_CURRENT_SHA: currentSha,
      EXPECTED_UNVERIFIED_SHA: unverifiedSha,
      RECOVERY_CONFIRMATION: confirmation,
    });
    expect(admitted.status, admitted.stderr).toBe(0);
    expect(admitted.output).toBe('operation=reconcile-rollback\n');

    const open = runAdmission({
      EVENT_NAME: 'workflow_dispatch',
      REQUESTED_OPERATION: 'reconcile-rollback',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'open',
      EXPECTED_CURRENT_SHA: currentSha,
      EXPECTED_UNVERIFIED_SHA: unverifiedSha,
      RECOVERY_CONFIRMATION: confirmation,
    });
    expect(open.status).toBe(1);
    expect(open.stderr).toContain(
      'Rollback reconciliation requires paused production admission.',
    );

    const wrongConfirmation = runAdmission({
      EVENT_NAME: 'workflow_dispatch',
      REQUESTED_OPERATION: 'reconcile-rollback',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'paused',
      EXPECTED_CURRENT_SHA: currentSha,
      EXPECTED_UNVERIFIED_SHA: unverifiedSha,
      RECOVERY_CONFIRMATION: 'RECONCILE_ROLLBACK',
    });
    expect(wrongConfirmation.status).toBe(1);
  });

  it('admits only an exact manually confirmed clean-epoch target while paused', () => {
    const targetSha = 'c'.repeat(40);
    const confirmation = `CUTOVER:clean-owner-epoch-v1:${currentSha}:${targetSha}`;
    for (const operation of ['clean-epoch', 'resume-clean-epoch']) {
      const admitted = runAdmission({
        EVENT_NAME: 'workflow_dispatch',
        REQUESTED_OPERATION: operation,
        PRODUCTION_DEPLOYMENT_ADMISSION: 'paused',
        EXPECTED_CURRENT_SHA: currentSha,
        EXPECTED_UNVERIFIED_SHA: '',
        RECOVERY_CONFIRMATION: confirmation,
        MANUAL_SHA: targetSha,
      });
      expect(admitted.status, admitted.stderr).toBe(0);
      expect(admitted.output).toBe(`operation=${operation}\n`);
    }

    const open = runAdmission({
      EVENT_NAME: 'workflow_dispatch',
      REQUESTED_OPERATION: 'clean-epoch',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'open',
      EXPECTED_CURRENT_SHA: currentSha,
      RECOVERY_CONFIRMATION: confirmation,
      MANUAL_SHA: targetSha,
    });
    expect(open.status).toBe(1);
    expect(open.stderr).toContain(
      'Clean-epoch cutover requires paused production admission.',
    );
  });

  it('admits only exact paired clean-epoch recovery while paused', () => {
    const targetSha = 'c'.repeat(40);
    const confirmation = `RECOVER_CLEAN_EPOCH:clean-owner-epoch-v1:${currentSha}:${targetSha}`;
    const admitted = runAdmission({
      EVENT_NAME: 'workflow_dispatch',
      REQUESTED_OPERATION: 'recover-clean-epoch',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'paused',
      EXPECTED_CURRENT_SHA: currentSha,
      EXPECTED_UNVERIFIED_SHA: '',
      RECOVERY_CONFIRMATION: confirmation,
      MANUAL_SHA: targetSha,
    });
    expect(admitted.status, admitted.stderr).toBe(0);
    expect(admitted.output).toBe('operation=recover-clean-epoch\n');

    const open = runAdmission({
      EVENT_NAME: 'workflow_dispatch',
      REQUESTED_OPERATION: 'recover-clean-epoch',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'open',
      EXPECTED_CURRENT_SHA: currentSha,
      RECOVERY_CONFIRMATION: confirmation,
      MANUAL_SHA: targetSha,
    });
    expect(open.status).toBe(1);
    expect(open.stderr).toContain(
      'Clean-epoch recovery requires paused production admission.',
    );

    const recovery = workflowStep(
      'Recover exact legacy database and release pairing',
    );
    expect(recovery.if).toContain("operation == 'recover-clean-epoch'");
    expect(recovery.run).toContain(
      '/opt/pressly/ops/candidate/recover-clean-epoch.sh',
    );
    expect(recovery.run).toContain("'$recovery_entrypoint' --preflight-only");
    expect(recovery.run).toContain("'$recovery_entrypoint'");
    expect(recovery.run).toContain('PRESSLY_CLEAN_EPOCH_RECOVERY_CONFIRM');
  });

  it('rejects unknown admission and recovery identities before host access', () => {
    const unknown = runAdmission({
      EVENT_NAME: 'workflow_dispatch',
      REQUESTED_OPERATION: 'reconcile-rollback',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'maintenance',
    });
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain(
      'PRODUCTION_DEPLOYMENT_ADMISSION must be exactly open or paused.',
    );

    const sameIdentity = runAdmission({
      EVENT_NAME: 'workflow_dispatch',
      REQUESTED_OPERATION: 'reconcile-rollback',
      PRODUCTION_DEPLOYMENT_ADMISSION: 'paused',
      EXPECTED_CURRENT_SHA: currentSha,
      EXPECTED_UNVERIFIED_SHA: currentSha,
      RECOVERY_CONFIRMATION: `RECONCILE_ROLLBACK:${currentSha}:${currentSha}`,
    });
    expect(sameIdentity.status).toBe(1);
    expect(sameIdentity.stderr).toContain(
      'Recovery SHAs must be distinct full lowercase commit SHAs.',
    );
  });

  it('keeps rollback manual, locked, stable, and journal-owned', () => {
    const deploy = workflowStep('Run deployment');
    const recovery = workflowStep(
      'Reconcile exact failed release through stable rollback',
    );

    expect(deploy.if).toContain(
      "steps.deployment-admission.outputs.operation == 'deploy'",
    );
    expect(deploy.if).toContain(
      "steps.deployment-admission.outputs.operation == 'clean-epoch'",
    );
    expect(deploy.if).toContain(
      "steps.deployment-admission.outputs.operation == 'resume-clean-epoch'",
    );
    expect(deploy.run).toContain('--clean-epoch-cutover');
    expect(deploy.run).toContain('--resume-unverified');
    expect(recovery.if).toBe(
      "steps.deployment-admission.outputs.operation == 'reconcile-rollback'",
    );
    expect(recovery.run).toContain('exec 9>/opt/pressly/deploy.lock');
    expect(recovery.run).toContain('flock -n 9');
    expect(recovery.run).toContain('PRESSLY_DEPLOY_LOCK_HELD=1');
    expect(recovery.run).toContain('/opt/pressly/ops/current/rollback.sh');
    expect(recovery.run).not.toContain(
      '/opt/pressly/ops/candidate/rollback.sh',
    );
    expect(recovery.run).toContain("node '$remote_recovery_guard' preflight");
    expect(recovery.run).toContain("node '$remote_recovery_guard' verify");
    expect(recovery.run).toContain('sha256sum --check --strict --status');
    for (const mutation of [
      'rm -f /opt/pressly/deployment-state.json',
      'unlink /opt/pressly/deployment-state.json',
      'mv /opt/pressly/deployment-state.json',
      '> /opt/pressly/deployment-state.json',
    ])
      expect(recovery.run).not.toContain(mutation);
    expect(workflowSource).not.toMatch(/if:\s*\$\{\{\s*failure\(\)/u);
  });

  it('requires two validated off-host destinations for a clean epoch', () => {
    const deploy = workflowStep('Run deployment');

    expect(deploy.env).toMatchObject({
      CLEAN_EPOCH_BACKUP_S3_URI: '${{ secrets.PRESSLY_BACKUP_S3_URI }}',
      CLEAN_EPOCH_BACKUP_SECONDARY_S3_URI:
        '${{ secrets.PRESSLY_BACKUP_SECONDARY_S3_URI }}',
      CLEAN_EPOCH_BACKUP_SECONDARY_AWS_PROFILE:
        '${{ secrets.PRESSLY_BACKUP_SECONDARY_AWS_PROFILE }}',
      CLEAN_EPOCH_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER:
        '${{ secrets.PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER }}',
    });
    expect(deploy.run).toContain(
      'Clean-epoch backup destinations are absent or invalid.',
    );
    expect(deploy.run).toContain("PRESSLY_BACKUP_S3_URI='");
    expect(deploy.run).toContain("PRESSLY_BACKUP_SECONDARY_S3_URI='");
    expect(deploy.run).toContain(
      "PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER='",
    );
  });
});

describe('production recovery evidence guard', () => {
  it('accepts the exact failed state without mutating evidence and verifies closure', () => {
    const fixture = createRecoveryFixture();
    const evidencePaths = Object.values(fixture.paths).filter(
      (path) => path !== fixture.paths.opsCurrent,
    );
    const before = evidencePaths.map((path) => readFileSync(path, 'utf8'));

    const preflight = runGuard(fixture, 'preflight');
    expect(preflight.status, preflight.stderr).toBe(0);
    expect(JSON.parse(preflight.stdout)).toEqual({
      mode: 'preflight',
      currentSha,
      unresolvedSha: unverifiedSha,
    });
    expect(evidencePaths.map((path) => readFileSync(path, 'utf8'))).toEqual(
      before,
    );

    writeJson(fixture.paths.state, verifiedState());
    const verify = runGuard(fixture, 'verify');
    expect(verify.status, verify.stderr).toBe(0);
    expect(JSON.parse(verify.stdout)).toEqual({ mode: 'verify', currentSha });
  });

  it('rejects any mismatch in state, release evidence, checkout, or stable ops', () => {
    const wrongState = createRecoveryFixture();
    writeJson(wrongState.paths.state, {
      ...failedState(),
      sourceSha: otherSha,
    });
    expect(runGuard(wrongState, 'preflight').status).toBe(1);

    const wrongPrevious = createRecoveryFixture();
    writeJson(
      wrongPrevious.paths.previousMetadata,
      release(otherSha, unverifiedImages),
    );
    expect(runGuard(wrongPrevious, 'preflight').status).toBe(1);

    const wrongCheckout = createRecoveryFixture();
    const checkoutResult = runGuard(wrongCheckout, 'preflight', {
      checkoutSha: otherSha,
    });
    expect(checkoutResult.status).toBe(1);
    expect(checkoutResult.stderr).toContain(
      'Repository checkout does not match the expected current release.',
    );

    const wrongOps = createRecoveryFixture();
    writeMode600(
      join(realpathForTest(wrongOps.paths.opsCurrent), 'source-sha'),
      `${otherSha}\n`,
    );
    expect(runGuard(wrongOps, 'preflight').status).toBe(1);
  });

  it('requires failed running-unverified preflight and exact verified closure', () => {
    const inProgress = createRecoveryFixture();
    writeJson(inProgress.paths.state, {
      ...failedState(),
      outcome: 'in_progress',
      exitCode: null,
    });
    expect(runGuard(inProgress, 'preflight').status).toBe(1);

    const unresolved = createRecoveryFixture();
    const verify = runGuard(unresolved, 'verify');
    expect(verify.status).toBe(1);
    expect(verify.stderr).toContain(
      'Deployment state did not reconcile to the exact verified current release.',
    );
  });
});

function realpathForTest(path) {
  return resolve(path, '..', 'releases', currentSha);
}
