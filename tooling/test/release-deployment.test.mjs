import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
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
const deployScript = resolve(root, 'deploy/aws/lightsail/deploy.sh');
const rollbackScript = resolve(root, 'deploy/aws/lightsail/rollback.sh');
const deploymentTooling = resolve(
  root,
  'deploy/aws/lightsail/deployment-tooling.mjs',
);
const toolingErrorFactory = resolve(
  root,
  'platform/errors/src/tooling-error.mjs',
);
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

const fiveImageIdentity = ({
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
    [
      '#!/bin/sh',
      'set -eu',
      'printf "git %s\\n" "$*" >> "$COMMAND_LOG"',
      'if [ "$1" = "rev-parse" ]; then',
      '  if [ "${3:-}" = "HEAD" ]; then cat "$GIT_CHECKOUT_STATE_FILE"; else printf "%s\\n" "$EXPECTED_TARGET_SHA"; fi',
      'fi',
      'if [ "$1" = "status" ]; then',
      '  checkout_sha="$(cat "$GIT_CHECKOUT_STATE_FILE")"',
      '  if [ "${DIRTY_CHECKOUT:-false}" = "true" ]; then',
      '    printf "%s\\n" "${DIRTY_STATUS_OUTPUT:- M deploy/aws/lightsail/deploy.sh}"',
      '  elif [ "${DIRTY_AFTER_CHECKOUT:-false}" = "true" ] && [ "$checkout_sha" != "$INVOCATION_CHECKOUT_SHA" ]; then',
      '    printf "%s\\n" "${DIRTY_STATUS_OUTPUT:- M deploy/aws/lightsail/docker-compose.production.yml}"',
      '  fi',
      'fi',
      'if [ "$1" = "checkout" ] && [ "${2:-}" = "--detach" ]; then',
      '  printf "%s\\n" "$3" > "$GIT_CHECKOUT_STATE_FILE"',
      '  if [ "${CREATE_TARGET_COMPOSE_ON_CHECKOUT:-false}" = "true" ]; then',
      '    if [ "$3" = "$INVOCATION_CHECKOUT_SHA" ]; then',
      '      rm -f "$TARGET_COMPOSE_FILE"',
      '    else',
      '      mkdir -p "$(dirname "$TARGET_COMPOSE_FILE")"',
      '      printf "services: {}\\n" > "$TARGET_COMPOSE_FILE"',
      '    fi',
      '  fi',
      '  if [ "${REPLACE_REPO_TOOLING_ON_TARGET:-false}" = "true" ]; then',
      '    if [ "$3" = "$INVOCATION_CHECKOUT_SHA" ]; then',
      '      cp "$HARDENED_DEPLOY_SCRIPT" "$PRESSLY_REPO_DIR/deploy/aws/lightsail/deploy.sh"',
      '      cp "$HARDENED_ROLLBACK_SCRIPT" "$PRESSLY_REPO_DIR/deploy/aws/lightsail/rollback.sh"',
      '    else',
      '      printf "#!/bin/sh\\necho incompatible-target-deploy >&2\\nexit 97\\n" > "$PRESSLY_REPO_DIR/deploy/aws/lightsail/deploy.sh"',
      '      printf "#!/bin/sh\\necho incompatible-target-rollback >&2\\nexit 97\\n" > "$PRESSLY_REPO_DIR/deploy/aws/lightsail/rollback.sh"',
      '    fi',
      '    chmod 700 "$PRESSLY_REPO_DIR/deploy/aws/lightsail/deploy.sh" "$PRESSLY_REPO_DIR/deploy/aws/lightsail/rollback.sh"',
      '  fi',
      'fi',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(binDirectory, 'docker'),
    '#!/bin/sh\nset -eu\nprintf "docker %s\\n" "$*" >> "$COMMAND_LOG"\ncase " $* " in *" pull "*) if [ "${FAIL_DOCKER:-false}" = "true" ]; then exit 23; fi;; *" run --rm --workdir /repo migrate "*) if [ -n "${STATE_AT_MIGRATION_FILE:-}" ]; then cp "$PRESSLY_DEPLOYMENT_STATE_FILE" "$STATE_AT_MIGRATION_FILE"; fi; if [ "${FAIL_MIGRATION:-false}" = "true" ]; then exit 31; fi;; *" up -d "*) if [ -n "${STATE_AT_COMPOSE_UP_FILE:-}" ]; then cp "$PRESSLY_DEPLOYMENT_STATE_FILE" "$STATE_AT_COMPOSE_UP_FILE"; fi; if [ -n "${PREVIOUS_AT_COMPOSE_UP_FILE:-}" ]; then cp "$PRESSLY_PREVIOUS_RELEASE_METADATA_FILE" "$PREVIOUS_AT_COMPOSE_UP_FILE"; fi; if [ "${FAIL_COMPOSE_UP:-false}" = "true" ]; then exit 29; fi;; esac\nif [ "${1:-}" = image ] && [ "${2:-}" = inspect ]; then printf "%s\\n" "${IMAGE_REVISION_OVERRIDE:-$EXPECTED_TARGET_SHA}"; fi\n',
  );
  writeFileSync(
    join(binDirectory, 'curl'),
    '#!/bin/sh\nset -eu\nprintf "curl %s\\n" "$*" >> "$COMMAND_LOG"\nif [ -n "${STATE_AT_FIRST_HEALTH_FILE:-}" ] && [ ! -f "$STATE_AT_FIRST_HEALTH_FILE" ]; then cp "$PRESSLY_DEPLOYMENT_STATE_FILE" "$STATE_AT_FIRST_HEALTH_FILE"; fi\nif [ -n "${PREVIOUS_AT_FIRST_HEALTH_FILE:-}" ] && [ ! -f "$PREVIOUS_AT_FIRST_HEALTH_FILE" ]; then cp "$PRESSLY_PREVIOUS_RELEASE_METADATA_FILE" "$PREVIOUS_AT_FIRST_HEALTH_FILE"; fi\nif [ -n "${CURL_FAILURE_COUNTER_FILE:-}" ]; then count=0; if [ -f "$CURL_FAILURE_COUNTER_FILE" ]; then count="$(cat "$CURL_FAILURE_COUNTER_FILE")"; fi; count=$((count + 1)); printf "%s\\n" "$count" > "$CURL_FAILURE_COUNTER_FILE"; if [ "$count" -le "${FAIL_CURL_ATTEMPTS:-0}" ]; then exit 35; fi; fi\nprintf "%s" "${CURL_HTTP_STATUS:-200}"\n',
  );
  writeFileSync(
    join(binDirectory, 'getent'),
    '#!/bin/sh\nset -eu\nprintf "getent %s\\n" "$*" >> "$COMMAND_LOG"\nif [ -n "${STATE_AT_FIRST_DNS_FILE:-}" ] && [ ! -f "$STATE_AT_FIRST_DNS_FILE" ]; then cp "$PRESSLY_DEPLOYMENT_STATE_FILE" "$STATE_AT_FIRST_DNS_FILE"; fi\nif [ "${FAIL_DNS_HOST:-}" = "${2:-}" ]; then exit 2; fi\naddress="${DNS_ADDRESS_OVERRIDE:-127.0.0.1}"\nif [ -n "${DNS_DRIFT_AFTER_CALLS:-}" ]; then call_count="$(grep -c "^getent " "$COMMAND_LOG")"; if [ "$call_count" -gt "$DNS_DRIFT_AFTER_CALLS" ]; then address="${DNS_DRIFT_ADDRESS:-192.0.2.44}"; fi; fi\nprintf "%s STREAM %s\\n" "$address" "${2:-}"\n',
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
    'deploy/aws/lightsail/docker-compose.production.yml',
  );
  mkdirSync(resolve(compose, '..'), { recursive: true });
  writeFileSync(compose, 'services: {}\n');
  for (const assetName of [
    'Caddyfile',
    'clean-epoch-cutover.json',
    'clean-epoch-legacy-compose.override.yml',
  ])
    copyFileSync(
      join(root, 'deploy/aws/lightsail', assetName),
      join(repoDirectory, 'deploy/aws/lightsail', assetName),
    );
  for (const scriptName of [
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
  ]) {
    const source = join(root, 'deploy/aws/lightsail', scriptName);
    const destination = join(repoDirectory, 'deploy/aws/lightsail', scriptName);
    copyFileSync(source, destination);
    chmodSync(destination, 0o700);
  }
  const fixtureDeploymentTooling = join(
    repoDirectory,
    'deploy/aws/lightsail/deployment-tooling.mjs',
  );
  copyFileSync(deploymentTooling, fixtureDeploymentTooling);
  chmodSync(fixtureDeploymentTooling, 0o700);
  const fixtureErrorFactory = join(
    repoDirectory,
    'platform/errors/src/tooling-error.mjs',
  );
  mkdirSync(resolve(fixtureErrorFactory, '..'), { recursive: true });
  copyFileSync(toolingErrorFactory, fixtureErrorFactory);
  chmodSync(fixtureErrorFactory, 0o700);
  writeFileSync(
    join(directory, 'current-release'),
    `${currentMetadata.sourceSha}\n`,
  );
  writeFileSync(
    join(directory, 'current-release.json'),
    `${JSON.stringify(currentMetadata)}\n`,
  );
  const checkoutState = join(directory, 'checkout-state');
  writeFileSync(checkoutState, `${currentMetadata.sourceSha}\n`);
  const commands = writeCommandStubs(directory);
  return {
    ...commands,
    compose,
    checkoutState,
    invocationCheckoutSha: currentMetadata.sourceSha,
    directory,
    envDirectory,
    repoDirectory,
  };
};

const installPreviousRelease = (fixture, metadata) => {
  writeFileSync(
    join(fixture.directory, 'previous-release.json'),
    `${JSON.stringify(metadata)}\n`,
  );
  writeFileSync(
    join(fixture.directory, 'previous-release'),
    `${metadata.sourceSha}\n`,
  );
};

const installHostReleaseTooling = (fixture) => {
  const hostDeploy = join(
    fixture.repoDirectory,
    'deploy/aws/lightsail/deploy.sh',
  );
  const hostRollback = join(
    fixture.repoDirectory,
    'deploy/aws/lightsail/rollback.sh',
  );
  copyFileSync(deployScript, hostDeploy);
  copyFileSync(rollbackScript, hostRollback);
  chmodSync(hostDeploy, 0o700);
  chmodSync(hostRollback, 0o700);
  return { hostDeploy, hostRollback };
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
  PRESSLY_PREVIOUS_RELEASE_METADATA_FILE: join(
    fixture.directory,
    'previous-release.json',
  ),
  PRESSLY_DEPLOYMENT_STATE_FILE: join(
    fixture.directory,
    'deployment-state.json',
  ),
  COMMAND_LOG: fixture.commandLog,
  EXPECTED_TARGET_SHA: sha,
  GIT_CHECKOUT_STATE_FILE: fixture.checkoutState,
  INVOCATION_CHECKOUT_SHA: fixture.invocationCheckoutSha,
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
    expect(deploy).toContain('node --import tsx tooling/postgres/migrate.ts');
    const compose = readFileSync(
      resolve(root, 'deploy/aws/lightsail/docker-compose.production.yml'),
      'utf8',
    );
    expect(
      compose.match(/SENTRY_RELEASE: \$\{PRESSLY_RELEASE_SHA:/g),
    ).toHaveLength(2);
  });

  it('stages and verifies the target-commit deploy script before execution', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/deploy-production.yml'),
      'utf8',
    );

    expect(workflow).toContain('Checkout deployed release tooling');
    expect(workflow).toContain(
      "local_deploy_script='release-source/deploy/aws/lightsail/deploy.sh'",
    );
    expect(workflow).toContain(
      "'umask 077; mktemp -d /tmp/pressly-deploy.XXXXXXXX'",
    );
    expect(workflow).toContain('scp "${ssh_args[@]}"');
    expect(workflow).toContain('deploy_script_digest="$(sha256sum');
    expect(workflow).toContain('sha256sum --check --strict --status');
    expect(workflow).toContain(
      "local_deployment_tooling='release-source/deploy/aws/lightsail/deployment-tooling.mjs'",
    );
    expect(workflow).toContain(
      "local_tooling_error_factory='release-source/platform/errors/src/tooling-error.mjs'",
    );
    expect(workflow).toContain(
      "PRESSLY_DEPLOY_TOOLING_FILE='$remote_deployment_tooling'",
    );
    expect(workflow).toContain("'$remote_deploy_script'");
    expect(workflow).not.toContain(
      "PROCESSOR_IMAGE='$PROCESSOR_IMAGE' /opt/pressly/repo/deploy/aws/lightsail/deploy.sh",
    );
  });

  it('reconciles a checksum-pinned Node 24 runtime before deployment', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/deploy-production.yml'),
      'utf8',
    );
    const hostKey = workflow.indexOf(
      '- name: Install verified Lightsail host key',
    );
    const reconcile = workflow.indexOf(
      '- name: Reconcile pinned Lightsail Node runtime',
    );
    const deploy = workflow.indexOf('- name: Run deployment');

    expect(hostKey).toBeGreaterThan(0);
    expect(reconcile).toBeGreaterThan(hostKey);
    expect(deploy).toBeGreaterThan(reconcile);
    expect(workflow).toContain("node_version='24.18.0'");
    expect(workflow).toContain(
      "node_archive_sha256='783130984963db7ba9cbd01089eaf2c2efb055c7c1693c943174b967b3050cb8'",
    );
    expect(workflow).toContain(
      "node_archive_sha256='6b4484c2190274175df9aa8f28e2d758a819cb1c1fe6ab481e2f95b463ab8508'",
    );
    expect(workflow).toContain('sha256sum --check --strict --status');
    expect(workflow).toContain('sudo -n install -o root -g root -m 0755');
    expect(workflow).toContain('/usr/local/bin/node');
    expect(workflow).toContain('await import(\\"node:fs\\")');
  });

  it('validates canonical Compose only from the selected target checkout', () => {
    const deploy = readFileSync(deployScript, 'utf8');
    const checkout = deploy.indexOf('git checkout --detach "$DEPLOY_SHA"');
    const targetComposeCheck = deploy.indexOf(
      'if [[ ! -f "$COMPOSE_FILE" ]]',
      checkout,
    );
    const candidateInstall = deploy.indexOf(
      'install_ops_bundle "$target_sha" "candidate"',
    );

    expect(checkout).toBeGreaterThan(0);
    expect(targetComposeCheck).toBeGreaterThan(checkout);
    expect(candidateInstall).toBeGreaterThan(targetComposeCheck);
    expect(deploy).toContain(
      '# requiring a compatibility copy in the currently deployed checkout',
    );
  });

  it('crosses a source-root cutover before requiring canonical Compose', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
    );
    rmSync(fixture.compose);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        CREATE_TARGET_COMPOSE_ON_CHECKOUT: 'true',
        TARGET_COMPOSE_FILE: fixture.compose,
      }),
    });

    expect(result.status, result.stderr).toBe(0);
    const commands = readFileSync(fixture.commandLog, 'utf8');
    expect(commands.indexOf(`git checkout --detach ${sha}`)).toBeLessThan(
      commands.indexOf('docker compose --profile tools'),
    );
    expect(existsSync(fixture.compose)).toBe(true);
  });

  it('documents the dry host preflight and file-scoped production bootstrap', () => {
    const runbook = readFileSync(
      resolve(root, 'deploy/aws/lightsail/README.md'),
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

  it('host admission rejects an application image from the wrong repository', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
    );

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        PRESSLY_WORKER_IMAGE: image('api', 'f'),
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'workerImage repository does not match worker',
    );
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toContain('getent ');
  });

  it('host admission rejects one digest reused across repository aliases', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
    );
    const sharedDigestWorker = `ghcr.io/example/alternate/worker@sha256:${'a'.repeat(
      64,
    )}`;

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        PRESSLY_WORKER_IMAGE: sharedDigestWorker,
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('image digests must be distinct');
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toContain('getent ');
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

  it('keeps the release unverified when DNS drifts after pinned public health passes', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        DNS_DRIFT_AFTER_CALLS: '8',
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'API DNS preflight did not resolve api.example.test exclusively to the expected production IP.',
    );
    const commands = readFileSync(fixture.commandLog, 'utf8');
    expect(commands).toContain(
      'curl --silent --show-error --max-time 10 --output /dev/null --write-out %{http_code} --resolve control.example.test:443:127.0.0.1 https://control.example.test/health',
    );
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: sha,
      phase: 'running_unverified',
      outcome: 'failed',
    });
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toEqual(current);
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

  it('fails fast when another host deployment holds the shared lock', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
    );

    const result = spawnSync(
      'bash',
      [
        '-c',
        'exec 8>"$PRESSLY_DEPLOY_LOCK_FILE"; flock -n 8; bash "$DEPLOY_SCRIPT"',
      ],
      {
        encoding: 'utf8',
        env: deploymentEnv(fixture, {
          DEPLOY_SCRIPT: deployScript,
          PRESSLY_DEPLOY_LOCK_FILE: join(fixture.directory, 'deploy.lock'),
        }),
      },
    );

    expect(result.status).toBe(75);
    expect(result.stderr).toContain(
      'Another deployment or rollback is already in progress.',
    );
    expect(existsSync(fixture.commandLog)).toBe(false);
  });

  it('refuses deployment while a durable Postgres restore is active', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
    );
    writeFileSync(
      join(fixture.directory, 'postgres-restore.json'),
      '{"phase":"preparing"}\n',
    );

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).toBe(75);
    expect(result.stderr).toContain(
      'Active Postgres restore journal blocks deployment',
    );
    expect(existsSync(fixture.commandLog)).toBe(false);
  });

  it('requires an exact expected production IP before deployment mutation', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
    );

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, { PRESSLY_EXPECTED_PUBLIC_IP: '' }),
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'PRESSLY_EXPECTED_PUBLIC_IP is required for deployment and rollback',
    );
    expect(existsSync(fixture.commandLog)).toBe(false);
  });

  it('rejects different images for an already recorded source SHA', () => {
    const fixture = createHostFixture(
      fiveImageMetadata({
        sourceSha: sha,
        releaseImages: {
          ...images,
          PRESSLY_PROCESSOR_IMAGE: image('processor', '6'),
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

  it('rejects an unsupported current release format before target mutation', () => {
    const current = {
      ...fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
      releaseFormat: 'unsupported-release-v0',
    };
    const fixture = createHostFixture(current);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'metadata is not a complete five-image release',
    );
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toMatch(
      /git (fetch|checkout)/,
    );
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

  it('records running-unverified before a migration attempt and preserves it on failure', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const atMigration = join(
      fixture.directory,
      'state-at-migration-attempt.json',
    );

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        FAIL_MIGRATION: 'true',
        STATE_AT_MIGRATION_FILE: atMigration,
      }),
    });

    expect(result.status).toBe(31);
    expect(JSON.parse(readFileSync(atMigration, 'utf8'))).toMatchObject({
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
      phase: 'running_unverified',
      outcome: 'failed',
      exitCode: 31,
    });
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toContain(
      'up -d --remove-orphans --wait',
    );
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

  it('admits rollback only for the exact saved release identity', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const rollbackManifest = join(
      fixture.directory,
      'rollback-release-admission.json',
    );
    writeFileSync(rollbackManifest, `${JSON.stringify(current)}\n`);

    const result = spawnSync('bash', [deployScript, '--rollback'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        PRESSLY_ROLLBACK_RELEASE_MANIFEST_FILE: rollbackManifest,
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Rollback target does not exactly match the admitted release manifest.',
    );
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toContain('getent ');
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

  it('reconciles a failed deployment by rolling back the exact prior release', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);

    const failedDeployment = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, { FAIL_COMPOSE_UP: 'true' }),
    });

    expect(failedDeployment.status).toBe(29);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: sha,
      phase: 'running_unverified',
      outcome: 'failed',
    });

    const rollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: currentSha,
        FAIL_COMPOSE_UP: 'false',
        PRESSLY_DEPLOY_SCRIPT: deployScript,
      }),
    });

    expect(rollback.stderr).toBe('');
    expect(rollback.status).toBe(0);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: currentSha,
      apiImage: currentImages.PRESSLY_API_IMAGE,
      webImage: currentImages.PRESSLY_WEB_IMAGE,
      workerImage: currentImages.PRESSLY_WORKER_IMAGE,
      processorImage: currentImages.PRESSLY_PROCESSOR_IMAGE,
      controlImage: currentImages.PRESSLY_CONTROL_IMAGE,
      phase: 'verified',
      outcome: 'succeeded',
      exitCode: 0,
    });
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: currentSha,
      apiImage: currentImages.PRESSLY_API_IMAGE,
      webImage: currentImages.PRESSLY_WEB_IMAGE,
      workerImage: currentImages.PRESSLY_WORKER_IMAGE,
      processorImage: currentImages.PRESSLY_PROCESSOR_IMAGE,
      controlImage: currentImages.PRESSLY_CONTROL_IMAGE,
    });
  });

  it('retains both recovery identities and admits only the exact rollback retry', () => {
    const verifiedA = fiveImageMetadata();
    const fixture = createHostFixture(verifiedA);

    const failedB = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        DEPLOY_SHA: currentSha,
        ...currentImages,
        EXPECTED_TARGET_SHA: currentSha,
        FAIL_COMPOSE_UP: 'true',
      }),
    });
    expect(failedB.status).toBe(29);

    const failedRecovery = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: sha,
        FAIL_DOCKER: 'true',
        PRESSLY_DEPLOY_SCRIPT: deployScript,
      }),
    });
    expect(failedRecovery.status).toBe(23);

    const recoveryState = JSON.parse(
      readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
    );
    expect(recoveryState).toMatchObject({
      schemaVersion: 2,
      phase: 'recovering_unverified',
      outcome: 'failed',
      exitCode: 23,
      unresolvedRelease: fiveImageIdentity({
        sourceSha: currentSha,
        releaseImages: currentImages,
      }),
      recoveryTarget: fiveImageIdentity(),
    });
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
      ),
    ).toEqual(verifiedA);

    const normalAttempt = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        DEPLOY_SHA: currentSha,
        ...currentImages,
        EXPECTED_TARGET_SHA: currentSha,
      }),
    });
    expect(normalAttempt.status).toBe(1);
    expect(normalAttempt.stderr).toContain('Deployment recovery is unresolved');
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toEqual(recoveryState);

    const resumeAttempt = spawnSync(
      'bash',
      [deployScript, '--resume-unverified'],
      {
        encoding: 'utf8',
        env: deploymentEnv(fixture, {
          DEPLOY_SHA: currentSha,
          ...currentImages,
          EXPECTED_TARGET_SHA: currentSha,
        }),
      },
    );
    expect(resumeAttempt.status).toBe(1);
    expect(resumeAttempt.stderr).toContain(
      '--resume-unverified cannot erase an unresolved rollback recovery',
    );
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toEqual(recoveryState);

    const wrongSha = 'd'.repeat(40);
    const wrongImages = {
      PRESSLY_API_IMAGE: image('api', '6'),
      PRESSLY_WEB_IMAGE: image('web', '7'),
      PRESSLY_WORKER_IMAGE: image('worker', '8'),
      PRESSLY_PROCESSOR_IMAGE: image('processor', '9'),
      PRESSLY_CONTROL_IMAGE: image('control', '0'),
    };
    const wrongManifest = join(fixture.directory, 'wrong-rollback.json');
    writeFileSync(
      wrongManifest,
      `${JSON.stringify(
        fiveImageMetadata({
          sourceSha: wrongSha,
          releaseImages: wrongImages,
        }),
      )}\n`,
    );
    const wrongRollback = spawnSync('bash', [deployScript, '--rollback'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        DEPLOY_SHA: wrongSha,
        ...wrongImages,
        EXPECTED_TARGET_SHA: wrongSha,
        PRESSLY_ROLLBACK_RELEASE_MANIFEST_FILE: wrongManifest,
      }),
    });
    expect(wrongRollback.status).toBe(1);
    expect(wrongRollback.stderr).toContain(
      'Rollback target does not exactly match the recorded recovery target.',
    );
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toEqual(recoveryState);

    const recoveryAtCompose = join(
      fixture.directory,
      'recovery-at-compose.json',
    );
    const recoveryAtHealth = join(fixture.directory, 'recovery-at-health.json');
    const exactRetry = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: sha,
        FAIL_DOCKER: 'false',
        PRESSLY_DEPLOY_SCRIPT: deployScript,
        STATE_AT_COMPOSE_UP_FILE: recoveryAtCompose,
        STATE_AT_FIRST_HEALTH_FILE: recoveryAtHealth,
      }),
    });
    expect(exactRetry.status).toBe(0);
    expect(exactRetry.stderr).toBe('');
    for (const observedState of [recoveryAtCompose, recoveryAtHealth]) {
      expect(JSON.parse(readFileSync(observedState, 'utf8'))).toMatchObject({
        schemaVersion: 2,
        phase: 'recovering_unverified',
        outcome: 'in_progress',
        unresolvedRelease: fiveImageIdentity({
          sourceSha: currentSha,
          releaseImages: currentImages,
        }),
        recoveryTarget: fiveImageIdentity(),
      });
    }
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      schemaVersion: 1,
      sourceSha: sha,
      phase: 'verified',
      outcome: 'succeeded',
      exitCode: 0,
    });
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
      'curl --silent --show-error --max-time 10 --output /dev/null --write-out %{http_code} --resolve api.example.test:443:127.0.0.1 https://api.example.test/health/ready',
      'curl --silent --show-error --max-time 10 --output /dev/null --write-out %{http_code} --resolve api.example.test:443:127.0.0.1 https://api.example.test/health/ready',
      'curl --silent --show-error --max-time 10 --output /dev/null --write-out %{http_code} --resolve api.example.test:443:127.0.0.1 https://api.example.test/health/ready',
      'curl --silent --show-error --max-time 10 --output /dev/null --write-out %{http_code} --resolve web.example.test:443:127.0.0.1 https://web.example.test/health',
      'curl --silent --show-error --max-time 10 --output /dev/null --write-out %{http_code} --resolve processor.example.test:443:127.0.0.1 https://processor.example.test/health',
      'curl --silent --show-error --max-time 10 --output /dev/null --write-out %{http_code} --resolve control.example.test:443:127.0.0.1 https://control.example.test/health',
    ]);
  });

  it('rejects a redirected public health endpoint', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        CURL_HTTP_STATUS: '302',
        PRESSLY_HEALTH_MAX_ATTEMPTS: '1',
        PRESSLY_HEALTH_RETRY_DELAY_SECONDS: '0',
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'API health check failed after 1 attempts.',
    );
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
    });
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
    expect(commands).not.toContain('run --rm --workdir /repo migrate');
    expect(commands).not.toContain('up -d --remove-orphans --wait');
  });

  it('fails closed before target checkout when the invocation checkout is dirty', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, { DIRTY_CHECKOUT: 'true' }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Deployment repository must be clean before checkout.',
    );
    expect(readFileSync(fixture.checkoutState, 'utf8').trim()).toBe(currentSha);
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toContain(
      `git checkout --detach ${sha}`,
    );
  });

  it.each([
    [
      'tracked Compose input',
      ' M deploy/aws/lightsail/docker-compose.production.yml',
    ],
    [
      'tracked migration input',
      ' M platform/postgres/migrations/0099_shadow.sql',
    ],
    [
      'untracked migration shadow',
      '?? platform/postgres/migrations/shadow.sql',
    ],
  ])(
    'fails closed and restores the invocation checkout for a %s after checkout',
    (_description, dirtyStatus) => {
      const current = fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      });
      const fixture = createHostFixture(current);

      const result = spawnSync('bash', [deployScript], {
        encoding: 'utf8',
        env: deploymentEnv(fixture, {
          DIRTY_AFTER_CHECKOUT: 'true',
          DIRTY_STATUS_OUTPUT: dirtyStatus,
        }),
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Target deployment checkout must be clean.',
      );
      expect(readFileSync(fixture.checkoutState, 'utf8').trim()).toBe(
        currentSha,
      );
      const commands = readFileSync(fixture.commandLog, 'utf8');
      expect(commands).toContain(`git checkout --detach ${sha}`);
      expect(commands).toContain(`git checkout --detach ${currentSha}`);
      expect(commands).not.toContain('config --quiet');
      expect(commands).not.toContain(' pull');
      expect(commands).not.toContain('run --rm --workdir /repo migrate');
      expect(commands).not.toContain('up -d --remove-orphans --wait');
    },
  );

  it('installs and advances a complete checksummed operations bundle after public health and before verified state closes', () => {
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
    expect(result.stderr).toBe('');
    const opsCurrent = join(fixture.directory, 'ops/current');
    const opsCandidate = join(fixture.directory, 'ops/candidate');
    expect(readFileSync(join(opsCurrent, 'source-sha'), 'utf8').trim()).toBe(
      sha,
    );
    expect(readFileSync(join(opsCandidate, 'source-sha'), 'utf8').trim()).toBe(
      sha,
    );

    const manifest = readFileSync(join(opsCurrent, 'SHA256SUMS'), 'utf8');
    for (const scriptName of [
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
    ]) {
      expect(existsSync(join(opsCurrent, scriptName))).toBe(true);
      expect(existsSync(join(opsCurrent, 'payload', scriptName))).toBe(true);
      expect(manifest).toContain(`  ${scriptName}\n`);
      expect(manifest).toContain(`  payload/${scriptName}\n`);
    }
    for (const assetName of [
      'Caddyfile',
      'clean-epoch-cutover.json',
      'clean-epoch-legacy-compose.override.yml',
      'docker-compose.production.yml',
    ]) {
      expect(existsSync(join(opsCurrent, 'payload', assetName))).toBe(true);
      expect(manifest).toContain(`  payload/${assetName}\n`);
    }
    expect(
      readFileSync(join(opsCurrent, 'recover-clean-epoch.sh'), 'utf8'),
    ).toContain(
      'PRESSLY_CLEAN_EPOCH_DECLARATION="$bundle_dir/payload/clean-epoch-cutover.json"',
    );
    expect(manifest).not.toContain('restore-postgres-proof.sh');
    expect(manifest).not.toContain('restore-postgres-drill-proof.sh');
    expect(readFileSync(join(opsCurrent, 'deploy.sh'), 'utf8')).toContain(
      'sha256sum --check --strict --status SHA256SUMS',
    );
  });

  it('recovers an exact release after ops/current advances but verified state is not committed', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const deployed = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });
    expect(deployed.status).toBe(0);

    writeFileSync(
      join(fixture.directory, 'deployment-state.json'),
      `${JSON.stringify(fiveImageDeploymentState())}\n`,
    );
    fixture.invocationCheckoutSha = sha;

    const resumed = spawnSync('bash', [deployScript, '--resume-unverified'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(resumed.status).toBe(0);
    expect(resumed.stderr).toBe('');
    expect(
      readFileSync(join(fixture.directory, 'ops/current/source-sha'), 'utf8'),
    ).toBe(`${sha}\n`);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: sha,
      phase: 'verified',
      outcome: 'succeeded',
    });
  });

  it('fails before migration when a required operations script is missing', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const missingScript = join(
      fixture.repoDirectory,
      'deploy/aws/lightsail/restore-postgres.sh',
    );
    rmSync(missingScript);

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Operations bundle source is missing: ${missingScript}`,
    );
    expect(readFileSync(fixture.checkoutState, 'utf8').trim()).toBe(currentSha);
    expect(readFileSync(fixture.commandLog, 'utf8')).not.toContain(
      'run --rm --workdir /repo migrate',
    );
    expect(existsSync(join(fixture.directory, 'ops/current'))).toBe(false);
  });

  it('rejects a corrupted operations payload at the stable entrypoint', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const deployed = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });
    expect(deployed.status).toBe(0);

    const stableRollback = join(fixture.directory, 'ops/current/rollback.sh');
    writeFileSync(
      join(fixture.directory, 'ops/current/payload/deploy.sh'),
      '#!/bin/sh\nexit 0\n',
    );
    const corrupted = spawnSync('bash', [stableRollback], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });

    expect(corrupted.status).toBe(70);
    expect(corrupted.stderr).toContain(
      'Operations bundle checksum verification failed:',
    );
  });

  it('keeps the stable operations revision after a successful app rollback', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const deployed = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });
    expect(deployed.status).toBe(0);

    const repoDeploy = join(
      fixture.repoDirectory,
      'deploy/aws/lightsail/deploy.sh',
    );
    writeFileSync(repoDeploy, '#!/bin/sh\nexit 97\n');
    chmodSync(repoDeploy, 0o700);

    const stableRollback = join(fixture.directory, 'ops/current/rollback.sh');
    const rollback = spawnSync('bash', [stableRollback], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: currentSha,
        INVOCATION_CHECKOUT_SHA: sha,
      }),
    });

    expect(rollback.status).toBe(0);
    expect(rollback.stderr).toBe('');
    expect(
      readFileSync(
        join(fixture.directory, 'ops/current/source-sha'),
        'utf8',
      ).trim(),
    ).toBe(sha);
    expect(
      readFileSync(
        join(fixture.directory, 'ops/candidate/source-sha'),
        'utf8',
      ).trim(),
    ).toBe(sha);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ).sourceSha,
    ).toBe(currentSha);
  });

  it('leaves a deterministic candidate dispatcher for first-deploy recovery in a fresh shell', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const failed = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, { FAIL_MIGRATION: 'true' }),
    });

    expect(failed.status).toBe(31);
    const candidateRollback = join(
      fixture.directory,
      'ops/candidate/rollback.sh',
    );
    expect(existsSync(candidateRollback)).toBe(true);
    expect(existsSync(join(fixture.directory, 'ops/current'))).toBe(false);

    // Model a hard-stop residue: the mutable checkout and its scripts are no
    // longer usable, and no exported lock/self-stage state reaches this shell.
    writeFileSync(fixture.checkoutState, `${sha}\n`);
    for (const scriptName of ['deploy.sh', 'rollback.sh']) {
      const path = join(
        fixture.repoDirectory,
        'deploy/aws/lightsail',
        scriptName,
      );
      writeFileSync(path, '#!/bin/sh\nexit 97\n');
      chmodSync(path, 0o700);
    }

    const recovered = spawnSync('bash', [candidateRollback], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: currentSha,
        INVOCATION_CHECKOUT_SHA: sha,
        FAIL_MIGRATION: 'false',
      }),
    });

    expect(recovered.status).toBe(0);
    expect(recovered.stderr).toBe('');
    expect(readFileSync(fixture.checkoutState, 'utf8').trim()).toBe(currentSha);
    expect(
      readFileSync(
        join(fixture.directory, 'ops/candidate/source-sha'),
        'utf8',
      ).trim(),
    ).toBe(sha);
    expect(existsSync(join(fixture.directory, 'ops/current'))).toBe(false);
  });

  it('binds candidate rollback to its sibling deploy revision when current is older', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const deployed = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture),
    });
    expect(deployed.status).toBe(0);

    const candidateDeployCapture = join(
      fixture.directory,
      'candidate-deploy-capture',
    );
    const repoDeploy = join(
      fixture.repoDirectory,
      'deploy/aws/lightsail/deploy.sh',
    );
    writeFileSync(
      repoDeploy,
      '#!/bin/sh\nset -eu\nprintf "%s\\n" "$*" > "$CANDIDATE_DEPLOY_CAPTURE"\nexit 66\n',
    );
    chmodSync(repoDeploy, 0o700);

    const failedFuture = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        DEPLOY_SHA: unverifiedSha,
        EXPECTED_TARGET_SHA: unverifiedSha,
        INVOCATION_CHECKOUT_SHA: sha,
        FAIL_MIGRATION: 'true',
      }),
    });
    expect(failedFuture.status).toBe(31);
    expect(
      readFileSync(
        join(fixture.directory, 'ops/current/source-sha'),
        'utf8',
      ).trim(),
    ).toBe(sha);
    expect(
      readFileSync(
        join(fixture.directory, 'ops/candidate/source-sha'),
        'utf8',
      ).trim(),
    ).toBe(unverifiedSha);

    const candidateRollback = join(
      fixture.directory,
      'ops/candidate/rollback.sh',
    );
    const rollback = spawnSync('bash', [candidateRollback], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        CANDIDATE_DEPLOY_CAPTURE: candidateDeployCapture,
        EXPECTED_TARGET_SHA: sha,
        INVOCATION_CHECKOUT_SHA: sha,
        FAIL_MIGRATION: 'false',
      }),
    });

    expect(rollback.status).toBe(66);
    expect(readFileSync(candidateDeployCapture, 'utf8').trim()).toBe(
      '--rollback',
    );
  });

  it.each([
    ['DNS preflight', { FAIL_DNS_HOST: 'control.example.test' }, 1],
    ['image pull', { FAIL_DOCKER: 'true' }, 23],
    [
      'image revision verification',
      { IMAGE_REVISION_OVERRIDE: 'f'.repeat(40) },
      1,
    ],
    ['migration', { FAIL_MIGRATION: 'true' }, 31],
    ['Compose replacement', { FAIL_COMPOSE_UP: 'true' }, 29],
  ])(
    'keeps the admitted rollback target durable after %s failure',
    (_stage, failureEnv, expectedStatus) => {
      const current = fiveImageMetadata({
        sourceSha: currentSha,
        releaseImages: currentImages,
      });
      const rollbackTarget = fiveImageMetadata();
      const fixture = createHostFixture(current);
      installPreviousRelease(fixture, rollbackTarget);
      writeFileSync(
        join(fixture.directory, 'deployment-state.json'),
        `${JSON.stringify(
          fiveImageDeploymentState({
            sourceSha: currentSha,
            releaseImages: currentImages,
            phase: 'verified',
            outcome: 'succeeded',
            exitCode: 0,
          }),
        )}\n`,
      );

      const rollback = spawnSync('bash', [rollbackScript], {
        encoding: 'utf8',
        env: deploymentEnv(fixture, {
          EXPECTED_TARGET_SHA: sha,
          PRESSLY_DEPLOY_SCRIPT: deployScript,
          ...failureEnv,
        }),
      });

      expect(rollback.status).toBe(expectedStatus);
      expect(
        JSON.parse(
          readFileSync(
            join(fixture.directory, 'previous-release.json'),
            'utf8',
          ),
        ),
      ).toEqual(rollbackTarget);
      expect(
        readFileSync(
          join(fixture.directory, 'previous-release'),
          'utf8',
        ).trim(),
      ).toBe(sha);
      expect(
        JSON.parse(
          readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
        ),
      ).toEqual(current);
    },
  );

  it('rotates the old current release into previous only after rollback verifies', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const rollbackTarget = fiveImageMetadata();
    const fixture = createHostFixture(current);
    installPreviousRelease(fixture, rollbackTarget);
    const previousAtCompose = join(
      fixture.directory,
      'previous-at-compose.json',
    );
    const previousAtHealth = join(fixture.directory, 'previous-at-health.json');

    const rollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: sha,
        PRESSLY_DEPLOY_SCRIPT: deployScript,
        PREVIOUS_AT_COMPOSE_UP_FILE: previousAtCompose,
        PREVIOUS_AT_FIRST_HEALTH_FILE: previousAtHealth,
      }),
    });

    expect(rollback.stderr).toBe('');
    expect(rollback.status).toBe(0);
    expect(JSON.parse(readFileSync(previousAtCompose, 'utf8'))).toEqual(
      rollbackTarget,
    );
    expect(JSON.parse(readFileSync(previousAtHealth, 'utf8'))).toEqual(
      rollbackTarget,
    );
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toMatchObject(fiveImageIdentity());
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(
      readFileSync(join(fixture.directory, 'previous-release'), 'utf8').trim(),
    ).toBe(currentSha);

    const deploy = readFileSync(deployScript, 'utf8');
    expect(deploy).toContain('durably_install_release_pair');
    expect(deploy).toContain('"$PREVIOUS_RELEASE_METADATA_FILE"');
  });

  it('retries the exact rollback after an unverified Compose failure', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const rollbackTarget = fiveImageMetadata();
    const fixture = createHostFixture(current);
    installPreviousRelease(fixture, rollbackTarget);

    const failedRollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: sha,
        FAIL_COMPOSE_UP: 'true',
        PRESSLY_DEPLOY_SCRIPT: deployScript,
      }),
    });
    expect(failedRollback.status).toBe(29);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
      ),
    ).toEqual(rollbackTarget);

    const retry = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: sha,
        FAIL_COMPOSE_UP: 'false',
        PRESSLY_DEPLOY_SCRIPT: deployScript,
      }),
    });
    expect(retry.status).toBe(0);
    expect(retry.stderr).toBe('');
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      sourceSha: sha,
      phase: 'verified',
      outcome: 'succeeded',
    });
  });

  it('retains old-current metadata when previous installation fails and reconstructs it on retry', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const rollbackTarget = fiveImageMetadata();
    const fixture = createHostFixture(current);
    installPreviousRelease(fixture, rollbackTarget);
    const blockedPreviousPointer = join(
      fixture.directory,
      'blocked-previous-pointer',
    );
    mkdirSync(blockedPreviousPointer);

    const failedInstall = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: sha,
        PRESSLY_DEPLOY_SCRIPT: deployScript,
        PRESSLY_PREVIOUS_RELEASE_FILE: blockedPreviousPointer,
      }),
    });
    expect(failedInstall.status).toBe(1);

    const recoveryState = JSON.parse(
      readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
    );
    expect(recoveryState).toMatchObject({
      schemaVersion: 2,
      phase: 'recovering_unverified',
      outcome: 'failed',
      recoveryTarget: rollbackTarget,
      rollbackPrevious: current,
    });
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'current-release.json'), 'utf8'),
      ),
    ).toMatchObject(fiveImageIdentity());

    // Model a power loss after both previous-release renames but before the
    // recovery state could close. The journal remains authoritative for A/B.
    installPreviousRelease(fixture, current);
    const retry = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        EXPECTED_TARGET_SHA: sha,
        PRESSLY_DEPLOY_SCRIPT: deployScript,
      }),
    });
    expect(retry.status).toBe(0);
    expect(retry.stderr).toBe('');
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'previous-release.json'), 'utf8'),
      ),
    ).toEqual(current);
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      schemaVersion: 1,
      sourceSha: sha,
      phase: 'verified',
      outcome: 'succeeded',
    });
  });

  it('restores hardened invocation tooling after a failed normal target checkout', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const { hostDeploy, hostRollback } = installHostReleaseTooling(fixture);
    const toolingReplacementEnv = {
      REPLACE_REPO_TOOLING_ON_TARGET: 'true',
      HARDENED_DEPLOY_SCRIPT: deployScript,
      HARDENED_ROLLBACK_SCRIPT: rollbackScript,
    };

    const failed = spawnSync('bash', [hostDeploy], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        ...toolingReplacementEnv,
        FAIL_COMPOSE_UP: 'true',
      }),
    });
    expect(failed.status).toBe(29);
    expect(readFileSync(fixture.checkoutState, 'utf8').trim()).toBe(currentSha);
    expect(readFileSync(hostDeploy, 'utf8')).toBe(
      readFileSync(deployScript, 'utf8'),
    );
    expect(readFileSync(hostRollback, 'utf8')).toBe(
      readFileSync(rollbackScript, 'utf8'),
    );

    const retry = spawnSync('bash', [hostDeploy, '--resume-unverified'], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        ...toolingReplacementEnv,
        FAIL_COMPOSE_UP: 'false',
      }),
    });
    expect(retry.status).toBe(0);
    expect(retry.stderr).toBe('');
  });

  it('restores hardened rollback tooling before an exact recovery retry', () => {
    const current = fiveImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const rollbackTarget = fiveImageMetadata();
    const fixture = createHostFixture(current);
    installPreviousRelease(fixture, rollbackTarget);
    const { hostDeploy, hostRollback } = installHostReleaseTooling(fixture);
    const toolingReplacementEnv = {
      REPLACE_REPO_TOOLING_ON_TARGET: 'true',
      HARDENED_DEPLOY_SCRIPT: deployScript,
      HARDENED_ROLLBACK_SCRIPT: rollbackScript,
    };

    const failed = spawnSync('bash', [hostRollback], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        ...toolingReplacementEnv,
        EXPECTED_TARGET_SHA: sha,
        FAIL_COMPOSE_UP: 'true',
        PRESSLY_DEPLOY_SCRIPT: hostDeploy,
      }),
    });
    expect(failed.status).toBe(29);
    expect(readFileSync(fixture.checkoutState, 'utf8').trim()).toBe(currentSha);
    expect(readFileSync(hostDeploy, 'utf8')).toBe(
      readFileSync(deployScript, 'utf8'),
    );
    expect(readFileSync(hostRollback, 'utf8')).toBe(
      readFileSync(rollbackScript, 'utf8'),
    );
    expect(
      JSON.parse(
        readFileSync(join(fixture.directory, 'deployment-state.json'), 'utf8'),
      ),
    ).toMatchObject({
      schemaVersion: 2,
      phase: 'recovering_unverified',
      recoveryTarget: rollbackTarget,
      rollbackPrevious: current,
    });

    const retry = spawnSync('bash', [hostRollback], {
      encoding: 'utf8',
      env: deploymentEnv(fixture, {
        ...toolingReplacementEnv,
        EXPECTED_TARGET_SHA: sha,
        FAIL_COMPOSE_UP: 'false',
        PRESSLY_DEPLOY_SCRIPT: hostDeploy,
      }),
    });
    expect(retry.status).toBe(0);
    expect(retry.stderr).toBe('');
  });

  it('rollback validates and forwards one complete prior release', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-rollback-'));
    const metadata = join(directory, 'previous-release.json');
    const capture = join(directory, 'capture.txt');
    const stub = join(directory, 'deploy-stub.sh');
    writeFileSync(metadata, `${JSON.stringify(fiveImageMetadata())}\n`);
    writeFileSync(
      stub,
      '#!/bin/sh\nset -eu\nprintf "%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n" "$DEPLOY_SHA" "$PRESSLY_API_IMAGE" "$PRESSLY_WEB_IMAGE" "$PRESSLY_WORKER_IMAGE" "$PRESSLY_PROCESSOR_IMAGE" "$PRESSLY_CONTROL_IMAGE" > "$CAPTURE_FILE"\n',
    );
    chmodSync(stub, 0o700);

    const rollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PRESSLY_PREVIOUS_RELEASE_METADATA_FILE: metadata,
        PRESSLY_DEPLOY_LOCK_FILE: join(directory, 'deploy.lock'),
        PRESSLY_DEPLOY_SCRIPT: stub,
        CAPTURE_FILE: capture,
      },
    });

    expect(rollback.stderr).toBe('');
    expect(rollback.status).toBe(0);
    expect(readFileSync(capture, 'utf8').trim().split('\n')).toEqual([
      sha,
      images.PRESSLY_API_IMAGE,
      images.PRESSLY_WEB_IMAGE,
      images.PRESSLY_WORKER_IMAGE,
      images.PRESSLY_PROCESSOR_IMAGE,
      images.PRESSLY_CONTROL_IMAGE,
    ]);
  });

  it('holds the shared lock across rollback target resolution and deploy', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-rollback-'));
    const metadata = join(directory, 'previous-release.json');
    const capture = join(directory, 'capture.txt');
    const stub = join(directory, 'deploy-stub.sh');
    const lock = join(directory, 'deploy.lock');
    writeFileSync(metadata, `${JSON.stringify(fiveImageMetadata())}\n`);
    writeFileSync(
      stub,
      '#!/bin/sh\nset -eu\nprintf "called\\n" > "$CAPTURE_FILE"\n',
    );
    chmodSync(stub, 0o700);

    const rollback = spawnSync(
      'bash',
      [
        '-c',
        'exec 8>"$PRESSLY_DEPLOY_LOCK_FILE"; flock -n 8; bash "$ROLLBACK_SCRIPT"',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PRESSLY_PREVIOUS_RELEASE_METADATA_FILE: metadata,
          PRESSLY_DEPLOY_LOCK_FILE: lock,
          PRESSLY_DEPLOY_SCRIPT: stub,
          ROLLBACK_SCRIPT: rollbackScript,
          CAPTURE_FILE: capture,
        },
      },
    );

    expect(rollback.status).toBe(75);
    expect(rollback.stderr).toContain(
      'Another deployment or rollback is already in progress.',
    );
    expect(existsSync(capture)).toBe(false);
  });

  it('refuses rollback while durable restore topology is quarantined', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-rollback-'));
    const metadata = join(directory, 'previous-release.json');
    const capture = join(directory, 'capture.txt');
    const stub = join(directory, 'deploy-stub.sh');
    writeFileSync(metadata, `${JSON.stringify(fiveImageMetadata())}\n`);
    writeFileSync(stub, '#!/bin/sh\nprintf "called\\n" > "$CAPTURE_FILE"\n');
    chmodSync(stub, 0o700);
    writeFileSync(
      join(directory, 'postgres-restore.json'),
      '{"phase":"target_quarantined"}\n',
    );

    const rollback = spawnSync('bash', [rollbackScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PRESSLY_APP_ROOT: directory,
        PRESSLY_PREVIOUS_RELEASE_METADATA_FILE: metadata,
        PRESSLY_DEPLOY_LOCK_FILE: join(directory, 'deploy.lock'),
        PRESSLY_DEPLOY_SCRIPT: stub,
        CAPTURE_FILE: capture,
      },
    });

    expect(rollback.status).toBe(75);
    expect(rollback.stderr).toContain(
      'Active Postgres restore journal blocks rollback',
    );
    expect(existsSync(capture)).toBe(false);
  });

  it.each([
    [
      'an unsupported release format',
      {
        ...fiveImageMetadata(),
        releaseFormat: 'unsupported-release-v0',
      },
    ],
    [
      'a release with an unknown field',
      {
        ...fiveImageMetadata(),
        extraImage: image('extra', 'f'),
      },
    ],
    [
      'an application image in the wrong repository',
      {
        ...fiveImageMetadata(),
        workerImage: image('api', '6'),
      },
    ],
    [
      'one digest reused across repository aliases',
      {
        ...fiveImageMetadata(),
        workerImage: `ghcr.io/example/alternate/worker@sha256:${'a'.repeat(64)}`,
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
        PRESSLY_DEPLOY_LOCK_FILE: join(directory, 'deploy.lock'),
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
        PRESSLY_DEPLOY_LOCK_FILE: join(directory, 'deploy.lock'),
      },
    });

    expect(rollback.status).not.toBe(0);
    expect(rollback.stderr).toContain('Previous release manifest is invalid.');
  });
});
