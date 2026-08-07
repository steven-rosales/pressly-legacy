import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const deployScript = resolve(root, 'infra/aws/lightsail/deploy.sh');
const rollbackScript = resolve(root, 'infra/aws/lightsail/rollback.sh');
const sha = 'a'.repeat(40);
const currentSha = 'b'.repeat(40);
const unverifiedSha = 'c'.repeat(40);
const deployedAt = '2026-07-12T16:00:00Z';
const image = (name, digest) =>
  `ghcr.io/example/pressly/${name}@sha256:${digest.repeat(64)}`;
const images = {
  PRESSLY_API_IMAGE: image('api', 'a'),
  PRESSLY_WEB_IMAGE: image('web', 'b'),
  PRESSLY_WORKER_IMAGE: image('worker', 'c'),
  PRESSLY_PROCESSOR_IMAGE: image('processor', 'd'),
  PRESSLY_CONTROL_IMAGE: image('control', 'e'),
};
const currentImages = {
  PRESSLY_API_IMAGE: image('api', '1'),
  PRESSLY_WEB_IMAGE: image('web', '2'),
  PRESSLY_WORKER_IMAGE: image('worker', '3'),
  PRESSLY_PROCESSOR_IMAGE: image('processor', '4'),
  PRESSLY_CONTROL_IMAGE: image('control', '5'),
};

const fiveImageMetadata = ({
  sourceSha = sha,
  releaseImages = images,
} = {}) => ({
  releaseFormat: 'five-image-v1',
  sourceSha,
  apiImage: releaseImages.PRESSLY_API_IMAGE,
  webImage: releaseImages.PRESSLY_WEB_IMAGE,
  workerImage: releaseImages.PRESSLY_WORKER_IMAGE,
  processorImage: releaseImages.PRESSLY_PROCESSOR_IMAGE,
  controlImage: releaseImages.PRESSLY_CONTROL_IMAGE,
  deployedAt,
});

const fiveImageDeploymentState = ({
  sourceSha = sha,
  releaseImages = images,
  phase = 'running_unverified',
  outcome = 'failed',
  exitCode = 1,
} = {}) => ({
  schemaVersion: 1,
  releaseFormat: 'five-image-v1',
  sourceSha,
  apiImage: releaseImages.PRESSLY_API_IMAGE,
  webImage: releaseImages.PRESSLY_WEB_IMAGE,
  workerImage: releaseImages.PRESSLY_WORKER_IMAGE,
  processorImage: releaseImages.PRESSLY_PROCESSOR_IMAGE,
  controlImage: releaseImages.PRESSLY_CONTROL_IMAGE,
  phase,
  outcome,
  exitCode,
  updatedAt: deployedAt,
});

const fourImageMetadata = ({ sourceSha = sha } = {}) => ({
  releaseFormat: 'four-image-v1',
  sourceSha,
  apiImage: images.PRESSLY_API_IMAGE,
  webImage: images.PRESSLY_WEB_IMAGE,
  workerImage: images.PRESSLY_WORKER_IMAGE,
  processorImage: images.PRESSLY_PROCESSOR_IMAGE,
  deployedAt,
});

const legacyMetadata = ({ sourceSha = sha, marked = true } = {}) => ({
  ...(marked
    ? {
        releaseFormat: 'legacy-two-image-v1',
        transition: 'first-four-image-cutover',
      }
    : {}),
  sourceSha,
  apiImage: image('api', 'e'),
  webImage: image('web', 'f'),
  deployedAt,
});

const writeMode600Env = (directory) => {
  const envDirectory = join(directory, 'env');
  mkdirSync(envDirectory, { recursive: true });
  for (const name of [
    'compose',
    'caddy',
    'web',
    'api',
    'worker',
    'processor',
    'control',
    'postgres',
    'migration',
    'backup',
  ]) {
    const path = join(envDirectory, `${name}.env`);
    writeFileSync(path, '\n');
    chmodSync(path, 0o600);
  }
  return envDirectory;
};

const writeCommandStubs = (directory) => {
  const binDirectory = join(directory, 'bin');
  const commandLog = join(directory, 'commands.log');
  mkdirSync(binDirectory, { recursive: true });
  writeFileSync(
    join(binDirectory, 'git'),
    '#!/bin/sh\nset -eu\nprintf "git %s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$1" = "rev-parse" ]; then printf "%s\\n" "$EXPECTED_TARGET_SHA"; fi\n',
  );
  writeFileSync(
    join(binDirectory, 'docker'),
    '#!/bin/sh\nset -eu\nprintf "docker %s\\n" "$*" >> "$COMMAND_LOG"\ncase " $* " in *" pull "*) if [ "${FAIL_DOCKER:-false}" = "true" ]; then exit 23; fi;; *" up -d "*) if [ -n "${STATE_AT_COMPOSE_UP_FILE:-}" ]; then cp "$PRESSLY_DEPLOYMENT_STATE_FILE" "$STATE_AT_COMPOSE_UP_FILE"; fi; if [ "${FAIL_COMPOSE_UP:-false}" = "true" ]; then exit 29; fi;; esac\nif [ "${1:-}" = image ] && [ "${2:-}" = inspect ]; then printf "%s\\n" "${IMAGE_REVISION_OVERRIDE:-$EXPECTED_TARGET_SHA}"; fi\n',
  );
  writeFileSync(
    join(binDirectory, 'curl'),
    '#!/bin/sh\nset -eu\nprintf "curl %s\\n" "$*" >> "$COMMAND_LOG"\nif [ -n "${STATE_AT_FIRST_HEALTH_FILE:-}" ] && [ ! -f "$STATE_AT_FIRST_HEALTH_FILE" ]; then cp "$PRESSLY_DEPLOYMENT_STATE_FILE" "$STATE_AT_FIRST_HEALTH_FILE"; fi\nif [ -n "${CURL_FAILURE_COUNTER_FILE:-}" ]; then count=0; if [ -f "$CURL_FAILURE_COUNTER_FILE" ]; then count="$(cat "$CURL_FAILURE_COUNTER_FILE")"; fi; count=$((count + 1)); printf "%s\\n" "$count" > "$CURL_FAILURE_COUNTER_FILE"; if [ "$count" -le "${FAIL_CURL_ATTEMPTS:-0}" ]; then exit 35; fi; fi\n',
  );
  writeFileSync(
    join(binDirectory, 'getent'),
    '#!/bin/sh\nset -eu\nprintf "getent %s\\n" "$*" >> "$COMMAND_LOG"\nif [ -n "${STATE_AT_FIRST_DNS_FILE:-}" ] && [ ! -f "$STATE_AT_FIRST_DNS_FILE" ]; then cp "$PRESSLY_DEPLOYMENT_STATE_FILE" "$STATE_AT_FIRST_DNS_FILE"; fi\nif [ "${FAIL_DNS_HOST:-}" = "${2:-}" ]; then exit 2; fi\nprintf "%s STREAM %s\\n" "${DNS_ADDRESS_OVERRIDE:-127.0.0.1}" "${2:-}"\n',
  );
  for (const command of ['git', 'docker', 'curl', 'getent'])
    chmodSync(join(binDirectory, command), 0o700);
  return { binDirectory, commandLog };
};

const createHostFixture = (currentMetadata) => {
  const directory = mkdtempSync(join(tmpdir(), 'pressly-release-host-'));
  const envDirectory = writeMode600Env(directory);
  const repoDirectory = join(directory, 'repo');
  const compose = join(
    repoDirectory,
    'infra/aws/lightsail/docker-compose.production.yml',
  );
  mkdirSync(resolve(compose, '..'), { recursive: true });
  writeFileSync(compose, 'services: {}\n');
  writeFileSync(
    join(directory, 'current-release'),
    `${currentMetadata.sourceSha}\n`,
  );
  writeFileSync(
    join(directory, 'current-release.json'),
    `${JSON.stringify(currentMetadata)}\n`,
  );
  const commands = writeCommandStubs(directory);
  return {
    ...commands,
    compose,
    directory,
    envDirectory,
    repoDirectory,
  };
};

const deploymentEnv = (fixture, overrides = {}) => ({
  ...process.env,
  DEPLOY_SHA: sha,
  ...images,
  PRESSLY_APP_ROOT: fixture.directory,
  PRESSLY_ENV_DIR: fixture.envDirectory,
  PRESSLY_REPO_DIR: fixture.repoDirectory,
  PRESSLY_API_HEALTH_URL: 'https://api.example.test/health/ready',
  PRESSLY_WEB_HEALTH_URL: 'https://web.example.test/health',
  PRESSLY_PROCESSOR_HEALTH_URL: 'https://processor.example.test/health',
  PRESSLY_CONTROL_HEALTH_URL: 'https://control.example.test/health',
  PRESSLY_EXPECTED_PUBLIC_IP: '127.0.0.1',
  PRESSLY_DEPLOYMENT_STATE_FILE: join(
    fixture.directory,
    'deployment-state.json',
  ),
  COMMAND_LOG: fixture.commandLog,
  EXPECTED_TARGET_SHA: sha,
  PATH: `${fixture.binDirectory}:${process.env.PATH}`,
  ...overrides,
});

describe('release deployment identity', () => {
  it('forwards every validated manifest image to the host deploy', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/deploy-production.yml'),
      'utf8',
    );

    for (const field of [
      'manifest.apiImage',
      'manifest.webImage',
      'manifest.workerImage',
      'manifest.processorImage',
      'manifest.controlImage',
      'PRESSLY_API_IMAGE',
      'PRESSLY_WEB_IMAGE',
      'PRESSLY_WORKER_IMAGE',
      'PRESSLY_PROCESSOR_IMAGE',
      'PRESSLY_CONTROL_IMAGE',
      'PRESSLY_EXPECTED_PUBLIC_IP',
    ])
      expect(workflow).toContain(field);

    const deploy = readFileSync(deployScript, 'utf8');
    expect(deploy).toContain('export PRESSLY_RELEASE_SHA="${DEPLOY_SHA,,}"');
    const compose = readFileSync(
      resolve(root, 'infra/aws/lightsail/docker-compose.production.yml'),
      'utf8',
    );
    expect(
      compose.match(/SENTRY_RELEASE: \$\{PRESSLY_RELEASE_SHA:/g),
    ).toHaveLength(2);
  });

  it('stages and verifies the target-commit deploy script before first cutover', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/deploy-production.yml'),
      'utf8',
    );

    expect(workflow).toContain('Checkout deployed release tooling');
    expect(workflow).toContain(
      "local_deploy_script='infra/aws/lightsail/deploy.sh'",
    );
    expect(workflow).toContain(
      "'umask 077; mktemp -d /tmp/pressly-deploy.XXXXXXXX'",
    );
    expect(workflow).toContain('scp "${ssh_args[@]}"');
    expect(workflow).toContain('deploy_script_digest="$(sha256sum');
    expect(workflow).toContain('sha256sum --check --status');
    expect(workflow).toContain("'$remote_deploy_script'");
    expect(workflow).not.toContain(
      "PROCESSOR_IMAGE='$PROCESSOR_IMAGE' /opt/pressly/repo/infra/aws/lightsail/deploy.sh",
    );
  });

  it('documents the dry host preflight and file-scoped production bootstrap', () => {
    const runbook = readFileSync(
      resolve(root, 'infra/aws/lightsail/README.md'),
      'utf8',
    );

    expect(runbook).toContain('deploy.sh --preflight-only');
    expect(runbook).toContain('including `backup.env`');
    expect(runbook).toContain(
      '$bootstrap_file:/run/pressly/lpms-bootstrap.json:ro',
    );
    expect(runbook).toContain('--entrypoint node');
    expect(runbook).toContain('--dry-run');
    expect(runbook).toContain('--apply');
  });

  it('deploy preflight rejects a missing or mutable image before host changes', () => {
    const missingWorker = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DEPLOY_SHA: sha,
        ...images,
        PRESSLY_WORKER_IMAGE: '',
      },
    });
    expect(missingWorker.status).not.toBe(0);
    expect(missingWorker.stderr).toContain(
      'PRESSLY_WORKER_IMAGE must be an immutable GHCR digest.',
    );

    const mutableProcessor = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DEPLOY_SHA: sha,
        ...images,
        PRESSLY_PROCESSOR_IMAGE: 'ghcr.io/example/pressly/processor:latest',
      },
    });
    expect(mutableProcessor.status).not.toBe(0);
    expect(mutableProcessor.stderr).toContain(
      'PRESSLY_PROCESSOR_IMAGE must be an immutable GHCR digest.',
    );
  });

  it('preflight-only validates the host without mutating deployment state', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const previous = `${JSON.stringify({ sentinel: 'unchanged' })}\n`;
    const deploymentState = `${JSON.stringify(
      fiveImageDeploymentState({
        sourceSha: currentSha,
        releaseImages: currentImages,
        phase: 'verified',
        outcome: 'succeeded',
        exitCode: 0,
      }),
    )}\n`;
    writeFileSync(join(fixture.directory, 'previous-release.json'), previous);
    writeFileSync(
      join(fixture.directory, 'deployment-state.json'),
      deploymentState,
    );

    const result = spawnSync('bash', [deployScript, '--preflight-only'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `Deployment preflight passed for source SHA: ${sha}`,
    );
    expect(
      readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
    ).toBe(previous);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(
      readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
    ).toBe(deploymentState);

    const commands = readFileSync(fixture.commandLog, 'utf8');
    expect(commands).toContain('docker compose version');
    expect(commands.match(/^getent ahostsv4 /gm)).toHaveLength(4);
    expect(commands).toContain('getent ahostsv4 api.example.test');
    expect(commands).toContain('getent ahostsv4 web.example.test');
    expect(commands).toContain('getent ahostsv4 processor.example.test');
    expect(commands).toContain('getent ahostsv4 control.example.test');
    expect(commands).toContain(`git cat-file -e ${sha}^{commit}`);
    expect(commands).toContain('config --quiet');
    expect(commands).not.toMatch(/git (fetch|checkout)/);
    expect(commands).not.toMatch(/docker .*\b(pull|run|up)\b/);
    expect(commands).not.toContain('curl ');
  });

  it('fails DNS preflight before release snapshots or target mutation', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const previous = `${JSON.stringify({ sentinel: 'unchanged' })}\n`;
    writeFileSync(join(fixture.directory, 'previous-release.json'), previous);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        FAIL_DNS_HOST: 'control.example.test',
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Control DNS preflight failed for control.example.test.',
    );
    expect(result.stderr).toContain('"event":"deployment.failed"');
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      schemaVersion: 1,
      releaseFormat: 'five-image-v1',
      sourceSha: sha,
      phase: 'failed_before_running',
      outcome: 'failed',
      exitCode: 1,
    });
    expect(
      readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
    ).toBe(previous);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toEqual(current);

    const commands = readFileSync(fixture.commandLog, 'utf8');
    expect(commands).not.toMatch(/git (fetch|checkout)/);
    expect(commands).not.toMatch(/docker .*\b(pull|run|up)\b/);
  });

  it('fails before mutation when DNS resolves to a different host', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        DNS_ADDRESS_OVERRIDE: '192.0.2.44',
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'API DNS preflight did not resolve api.example.test exclusively to the expected production IP.',
    );
    const commands = readFileSync(fixture.commandLog, 'utf8');
    expect(commands).not.toMatch(/git (fetch|checkout)/);
    expect(commands).not.toMatch(/docker .*\b(pull|run|up)\b/);
  });

  it('uses current-release JSON as authority when the derived SHA pointer lags', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    writeFileSync(
      join(fixture.directory, 'current-release'),
      `${unverifiedSha}\n`,
    );

    const result = spawnSync('bash', [deployScript, '--preflight-only'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).toBe(0);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(
      readFileSync(join(fixture.directory, 'current-release'), 'utf8').trim(),
    ).toBe(unverifiedSha);
  });

  it('preflight-only requires the mode-600 backup environment file', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
    );
    const backupEnv = join(fixture.envDirectory, 'backup.env');
    rmSync(backupEnv);

    const result = spawnSync('bash', [deployScript, '--preflight-only'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Missing env file: ${backupEnv}`);
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toMatch(
      /git (fetch|checkout)/,
    );
  });

  it('preflight-only rejects permissive backup environment permissions', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
    );
    const backupEnv = join(fixture.envDirectory, 'backup.env');
    chmodSync(backupEnv, 0o640);

    const result = spawnSync('bash', [deployScript, '--preflight-only'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `Invalid env file permissions. Expected 600: ${backupEnv}`,
    );
    expect(result.stderr).not.toContain('"event":"deployment.failed"');
  });

  it('rejects different images for an already recorded source SHA', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: sha,
        releaseImages: {
          ...images,
          PRESSLY_PROCESSOR_IMAGE: image('processor', 'e'),
        },
      }),
    );

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'the source SHA is already associated with a different release',
    );
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: sha,
      phase: 'failed_before_running',
      outcome: 'failed',
    });
  });

  it('snapshots the immediate five-image release before a failed upgrade', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    writeFileSync(
      join(fixture.directory, 'previous-release.json'),
      '{"stale":"n-minus-one"}\n',
    );

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, { FAIL_DOCKER: 'true' }),
    });

    expect(result.status).toBe(23);
    expect(result.stderr).toContain('"event":"deployment.failed"');
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(
      readFileSync(join(fixture.directory, 'previous-release'), 'utf8').trim(),
    ).toBe(currentSha);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: sha,
      phase: 'failed_before_running',
      outcome: 'failed',
      exitCode: 23,
    });

    const commands = readFileSync(fixture.commandLog, 'utf8');
    expect(commands).toContain(`git checkout --detach ${sha}`);
    expect(commands).toContain('docker compose');

    const script = readFileSync(deployScript, 'utf8');
    expect(script.indexOf('mv "$release_snapshot_tmp"')).toBeLessThan(
      script.indexOf('git checkout --detach "$DEPLOY_SHA"'),
    );
  });

  it('normalizes only the old two-image current shape for first-cutover rollback', () => {
    const current = legacyMetadata({ sourceSha: currentSha, marked: false });
    const fixture = createHostFixture(current);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, { FAIL_DOCKER: 'true' }),
    });

    expect(result.status).toBe(23);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
      ),
    ).toEqual(legacyMetadata({ sourceSha: currentSha }));
  });

  it('rotates current and previous metadata as one five-image release identity', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).toBe(0);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toMatchObject({
      releaseFormat: 'five-image-v1',
      sourceSha: sha,
      apiImage: images.PRESSLY_API_IMAGE,
      webImage: images.PRESSLY_WEB_IMAGE,
      workerImage: images.PRESSLY_WORKER_IMAGE,
      processorImage: images.PRESSLY_PROCESSOR_IMAGE,
      controlImage: images.PRESSLY_CONTROL_IMAGE,
    });
    expect(
      readFileSync(join(fixture.directory, 'current-release'), 'utf8').trim(),
    ).toBe(sha);
    expect(
      readFileSync(fixture.commandLog, 'utf8').match(
        /^docker image inspect /gm,
      ),
    ).toHaveLength(5);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      schemaVersion: 1,
      releaseFormat: 'five-image-v1',
      sourceSha: sha,
      apiImage: images.PRESSLY_API_IMAGE,
      webImage: images.PRESSLY_WEB_IMAGE,
      workerImage: images.PRESSLY_WORKER_IMAGE,
      processorImage: images.PRESSLY_PROCESSOR_IMAGE,
      controlImage: images.PRESSLY_CONTROL_IMAGE,
      phase: 'verified',
      outcome: 'succeeded',
      exitCode: 0,
    });
  });

  it('exposes attempted, running-unverified, and verified states at their boundaries', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const atComposeUp = join(fixture.directory, 'state-at-compose-up.json');
    const atFirstHealth = join(fixture.directory, 'state-at-first-health.json');

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        STATE_AT_COMPOSE_UP_FILE: atComposeUp,
        STATE_AT_FIRST_HEALTH_FILE: atFirstHealth,
      }),
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(atComposeUp, 'utf8'))).toMatchObject({
      sourceSha: sha,
      phase: 'running_unverified',
      outcome: 'in_progress',
      exitCode: null,
    });
    expect(JSON.parse(readFileSync(atFirstHealth, 'utf8'))).toMatchObject({
      sourceSha: sha,
      phase: 'running_unverified',
      outcome: 'in_progress',
      exitCode: null,
    });
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: sha,
      phase: 'verified',
      outcome: 'succeeded',
      exitCode: 0,
    });
  });

  it('refuses a new target while a running-unverified release is unresolved', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const unresolved = `${JSON.stringify(
      fiveImageDeploymentState({
        sourceSha: unverifiedSha,
        releaseImages: currentImages,
      }),
    )}\n`;
    writeFileSync(join(fixture.directory, 'deployment-state.json'), unresolved);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Deployment state is running_unverified; use --resume-unverified',
    );
    expect(
      readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
    ).toBe(unresolved);

    const commands = readFileSync(fixture.commandLog, 'utf8');
    expect(commands).not.toContain('getent ');
    expect(commands).not.toMatch(/git (fetch|checkout)/);
    expect(commands).not.toMatch(/docker .*\b(pull|run|up)\b/);
  });

  it('resumes only the exact running-unverified release identity', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const unresolved = fiveImageDeploymentState();
    writeFileSync(
      join(fixture.directory, 'deployment-state.json'),
      `${JSON.stringify(unresolved)}\n`,
    );
    const atFirstDns = join(fixture.directory, 'state-at-first-dns.json');
    const atComposeUp = join(fixture.directory, 'state-at-compose-up.json');

    const result = spawnSync('bash', [deployScript, '--resume-unverified'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        STATE_AT_FIRST_DNS_FILE: atFirstDns,
        STATE_AT_COMPOSE_UP_FILE: atComposeUp,
      }),
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(atFirstDns, 'utf8'))).toEqual(unresolved);
    expect(JSON.parse(readFileSync(atComposeUp, 'utf8'))).toMatchObject({
      releaseFormat: 'five-image-v1',
      sourceSha: sha,
      apiImage: images.PRESSLY_API_IMAGE,
      webImage: images.PRESSLY_WEB_IMAGE,
      workerImage: images.PRESSLY_WORKER_IMAGE,
      processorImage: images.PRESSLY_PROCESSOR_IMAGE,
      controlImage: images.PRESSLY_CONTROL_IMAGE,
      phase: 'running_unverified',
      outcome: 'in_progress',
      exitCode: null,
    });
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      releaseFormat: 'five-image-v1',
      sourceSha: sha,
      apiImage: images.PRESSLY_API_IMAGE,
      webImage: images.PRESSLY_WEB_IMAGE,
      workerImage: images.PRESSLY_WORKER_IMAGE,
      processorImage: images.PRESSLY_PROCESSOR_IMAGE,
      controlImage: images.PRESSLY_CONTROL_IMAGE,
      phase: 'verified',
      outcome: 'succeeded',
      exitCode: 0,
    });
  });

  it('refuses a resume whose immutable image identity differs', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const unresolved = `${JSON.stringify(
      fiveImageDeploymentState({ releaseImages: currentImages }),
    )}\n`;
    writeFileSync(join(fixture.directory, 'deployment-state.json'), unresolved);

    const result = spawnSync('bash', [deployScript, '--resume-unverified'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      '--resume-unverified target does not exactly match the recorded',
    );
    expect(
      readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
    ).toBe(unresolved);
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toContain('getent ');
  });

  it('preserves running-unverified truth when a resume fails before Compose', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    writeFileSync(
      join(fixture.directory, 'deployment-state.json'),
      `${JSON.stringify(fiveImageDeploymentState())}\n`,
    );

    const result = spawnSync('bash', [deployScript, '--resume-unverified'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, { FAIL_DOCKER: 'true' }),
    });

    expect(result.status).toBe(23);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      releaseFormat: 'five-image-v1',
      sourceSha: sha,
      apiImage: images.PRESSLY_API_IMAGE,
      webImage: images.PRESSLY_WEB_IMAGE,
      workerImage: images.PRESSLY_WORKER_IMAGE,
      processorImage: images.PRESSLY_PROCESSOR_IMAGE,
      controlImage: images.PRESSLY_CONTROL_IMAGE,
      phase: 'running_unverified',
      outcome: 'failed',
      exitCode: 23,
    });
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toContain(
      'up -d --remove-orphans --wait',
    );
  });

  it('records a failed Compose replacement as running-unverified', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, { FAIL_COMPOSE_UP: 'true' }),
    });

    expect(result.status).toBe(29);
    expect(result.stderr).toContain('"event":"deployment.failed"');
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: sha,
      phase: 'running_unverified',
      outcome: 'failed',
      exitCode: 29,
    });
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toEqual(current);
  });

  it('retries transient public readiness before committing release metadata', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const counter = join(fixture.directory, 'curl-attempts');

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        CURL_FAILURE_COUNTER_FILE: counter,
        FAIL_CURL_ATTEMPTS: '2',
        PRESSLY_HEALTH_MAX_ATTEMPTS: '4',
        PRESSLY_HEALTH_RETRY_DELAY_SECONDS: '0',
      }),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'API health check passed after 3 attempt(s).',
    );
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toMatchObject({
      releaseFormat: 'five-image-v1',
      sourceSha: sha,
    });

    const curls = readFileSync(fixture.commandLog, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('curl '));
    expect(curls).toEqual([
      'curl --fail --silent --show-error --max-time 10 --output /dev/null https://api.example.test/health/ready',
      'curl --fail --silent --show-error --max-time 10 --output /dev/null https://api.example.test/health/ready',
      'curl --fail --silent --show-error --max-time 10 --output /dev/null https://api.example.test/health/ready',
      'curl --fail --silent --show-error --max-time 10 --output /dev/null https://web.example.test/health',
      'curl --fail --silent --show-error --max-time 10 --output /dev/null https://processor.example.test/health',
      'curl --fail --silent --show-error --max-time 10 --output /dev/null https://control.example.test/health',
    ]);
  });

  it('leaves current release metadata unchanged when readiness never converges', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const counter = join(fixture.directory, 'curl-attempts');

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        CURL_FAILURE_COUNTER_FILE: counter,
        FAIL_CURL_ATTEMPTS: '99',
        PRESSLY_HEALTH_MAX_ATTEMPTS: '3',
        PRESSLY_HEALTH_RETRY_DELAY_SECONDS: '0',
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'API health check failed after 3 attempts.',
    );
    expect(result.stderr).toContain('"event":"deployment.failed"');
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: sha,
      phase: 'running_unverified',
      outcome: 'failed',
      exitCode: 1,
    });
    expect(
      readFileSync(fixture.commandLog, 'utf8').match(
        /https:\/\/api\.example\.test\/health\/ready/g,
      ),
    ).toHaveLength(3);
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toContain(
      'https://web.example.test/health',
    );
  });

  it('fails before migration when a pulled image revision label mismatches', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const wrongRevision = 'c'.repeat(40);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        IMAGE_REVISION_OVERRIDE: wrongRevision,
      }),
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `API image revision label is '${wrongRevision}'; expected ${sha}.`,
    );
    const commands = readFileSync(fixture.commandLog, 'utf8');
    expect(commands).toContain('docker image inspect');
    expect(commands).not.toContain(
      'run --rm --workdir /repo/packages/db migrate',
    );
    expect(commands).not.toContain('up -d --remove-orphans --wait');
  });

  it('rollback validates and forwards one complete prior release', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-rollback-'));
    const metadata = join(directory, 'previous-release.json');
    const capture = join(directory, 'capture.txt');
    const stub = join(directory, 'deploy-stub.sh');
    writeFileSync(metadata, `${JSON.stringify(fiveImageMetadata())}\n`);
    writeFileSync(
      stub,
      '#!/bin/sh\nset -eu\nprintf "%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n" "$PRESSLY_TARGET_RELEASE_FORMAT" "$DEPLOY_SHA" "$PRESSLY_API_IMAGE" "$PRESSLY_WEB_IMAGE" "$PRESSLY_WORKER_IMAGE" "$PRESSLY_PROCESSOR_IMAGE" "$PRESSLY_CONTROL_IMAGE" > "$CAPTURE_FILE"\n',
    );
    chmodSync(stub, 0o700);

    const rollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PRESSLY_PREVIOUS_RELEASE_METADATA_FILE: metadata,
        PRESSLY_DEPLOY_SCRIPT: stub,
        CAPTURE_FILE: capture,
      },
    });

    expect(rollback.stderr).toBe('');
    expect(rollback.status).toBe(0);
    expect(readFileSync(capture, 'utf8').trim().split('\n')).toEqual([
      'five-image-v1',
      sha,
      images.PRESSLY_API_IMAGE,
      images.PRESSLY_WEB_IMAGE,
      images.PRESSLY_WORKER_IMAGE,
      images.PRESSLY_PROCESSOR_IMAGE,
      images.PRESSLY_CONTROL_IMAGE,
    ]);
  });

  it('rolls back to a complete four-image release without inventing Control', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-rollback-'));
    const metadata = join(directory, 'previous-release.json');
    const capture = join(directory, 'capture.txt');
    const stub = join(directory, 'deploy-stub.sh');
    writeFileSync(metadata, `${JSON.stringify(fourImageMetadata())}\n`);
    writeFileSync(
      stub,
      '#!/bin/sh\nset -eu\nprintf "%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n" "$PRESSLY_TARGET_RELEASE_FORMAT" "$DEPLOY_SHA" "$PRESSLY_API_IMAGE" "$PRESSLY_WEB_IMAGE" "$PRESSLY_WORKER_IMAGE" "$PRESSLY_PROCESSOR_IMAGE" "${PRESSLY_CONTROL_IMAGE:-}" > "$CAPTURE_FILE"\n',
    );
    chmodSync(stub, 0o700);

    const rollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PRESSLY_PREVIOUS_RELEASE_METADATA_FILE: metadata,
        PRESSLY_DEPLOY_SCRIPT: stub,
        CAPTURE_FILE: capture,
      },
    });

    expect(rollback.stderr).toBe('');
    expect(rollback.status).toBe(0);
    expect(readFileSync(capture, 'utf8').trim().split('\n')).toEqual([
      'four-image-v1',
      sha,
      images.PRESSLY_API_IMAGE,
      images.PRESSLY_WEB_IMAGE,
      images.PRESSLY_WORKER_IMAGE,
      images.PRESSLY_PROCESSOR_IMAGE,
    ]);
  });

  it('restores the strictly marked first-cutover release and removes four-image orphans', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const legacy = legacyMetadata();
    writeFileSync(
      join(fixture.directory, 'previous-release.json'),
      `${JSON.stringify(legacy)}\n`,
    );

    const rollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        PRESSLY_DEPLOY_SCRIPT: deployScript,
      }),
    });

    expect(rollback.status).toBe(0);
    expect(rollback.stderr).toBe('');
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toMatchObject({
      releaseFormat: 'legacy-two-image-v1',
      transition: 'first-four-image-cutover',
      sourceSha: sha,
      apiImage: legacy.apiImage,
      webImage: legacy.webImage,
    });
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
      ),
    ).toEqual(current);

    const commands = readFileSync(fixture.commandLog, 'utf8');
    const checkoutIndex = commands.indexOf(`git checkout --detach ${sha}`);
    const upIndex = commands.indexOf('up -d --remove-orphans --wait');
    expect(checkoutIndex).toBeGreaterThan(-1);
    expect(upIndex).toBeGreaterThan(checkoutIndex);
    expect(commands).toContain(
      'curl --fail --silent --show-error --max-time 10 --output /dev/null https://api.example.test/health/ready',
    );
    expect(commands).toContain(
      'curl --fail --silent --show-error --max-time 10 --output /dev/null https://web.example.test/health',
    );
    expect(commands).not.toContain('https://processor.example.test/health');
    expect(commands.match(/^docker image inspect /gm)).toHaveLength(2);
  });

  it.each([
    ['an unmarked two-image record', legacyMetadata({ marked: false })],
    [
      'a mixed legacy and Worker record',
      {
        ...legacyMetadata(),
        workerImage: images.PRESSLY_WORKER_IMAGE,
      },
    ],
  ])('rollback rejects %s', (_description, release) => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-rollback-'));
    const metadata = join(directory, 'previous-release.json');
    writeFileSync(metadata, `${JSON.stringify(release)}\n`);

    const rollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PRESSLY_PREVIOUS_RELEASE_METADATA_FILE: metadata,
      },
    });

    expect(rollback.status).not.toBe(0);
    expect(rollback.stderr).toContain('Previous release manifest is invalid.');
  });

  it('rollback rejects a partial prior release', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-rollback-'));
    const metadata = join(directory, 'previous-release.json');
    writeFileSync(
      metadata,
      `${JSON.stringify({
        releaseFormat: 'five-image-v1',
        sourceSha: sha,
        apiImage: images.PRESSLY_API_IMAGE,
        webImage: images.PRESSLY_WEB_IMAGE,
        workerImage: images.PRESSLY_WORKER_IMAGE,
        deployedAt,
      })}\n`,
    );

    const rollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PRESSLY_PREVIOUS_RELEASE_METADATA_FILE: metadata,
      },
    });

    expect(rollback.status).not.toBe(0);
    expect(rollback.stderr).toContain('Previous release manifest is invalid.');
  });
});
