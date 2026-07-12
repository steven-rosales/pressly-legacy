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
const deployedAt = '2026-07-12T16:00:00Z';
const image = (name, digest) =>
  `ghcr.io/example/pressly/${name}@sha256:${digest.repeat(64)}`;
const images = {
  PRESSLY_API_IMAGE: image('api', 'a'),
  PRESSLY_WEB_IMAGE: image('web', 'b'),
  PRESSLY_WORKER_IMAGE: image('worker', 'c'),
  PRESSLY_PROCESSOR_IMAGE: image('processor', 'd'),
};
const currentImages = {
  PRESSLY_API_IMAGE: image('api', '1'),
  PRESSLY_WEB_IMAGE: image('web', '2'),
  PRESSLY_WORKER_IMAGE: image('worker', '3'),
  PRESSLY_PROCESSOR_IMAGE: image('processor', '4'),
};

const fourImageMetadata = ({
  sourceSha = sha,
  releaseImages = images,
} = {}) => ({
  releaseFormat: 'four-image-v1',
  sourceSha,
  apiImage: releaseImages.PRESSLY_API_IMAGE,
  webImage: releaseImages.PRESSLY_WEB_IMAGE,
  workerImage: releaseImages.PRESSLY_WORKER_IMAGE,
  processorImage: releaseImages.PRESSLY_PROCESSOR_IMAGE,
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
    '#!/bin/sh\nset -eu\nprintf "docker %s\\n" "$*" >> "$COMMAND_LOG"\ncase " $* " in *" pull "*) if [ "${FAIL_DOCKER:-false}" = "true" ]; then exit 23; fi;; esac\nif [ "${1:-}" = image ] && [ "${2:-}" = inspect ]; then printf "%s\\n" "${IMAGE_REVISION_OVERRIDE:-$EXPECTED_TARGET_SHA}"; fi\n',
  );
  writeFileSync(
    join(binDirectory, 'curl'),
    '#!/bin/sh\nset -eu\nprintf "curl %s\\n" "$*" >> "$COMMAND_LOG"\n',
  );
  for (const command of ['git', 'docker', 'curl'])
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
  COMMAND_LOG: fixture.commandLog,
  EXPECTED_TARGET_SHA: sha,
  PATH: `${fixture.binDirectory}:${process.env.PATH}`,
  ...overrides,
});

describe('four-image deployment identity', () => {
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
      'PRESSLY_API_IMAGE',
      'PRESSLY_WEB_IMAGE',
      'PRESSLY_WORKER_IMAGE',
      'PRESSLY_PROCESSOR_IMAGE',
    ])
      expect(workflow).toContain(field);
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
    const current = fourImageMetadata({
      sourceSha: currentSha,
      releaseImages: currentImages,
    });
    const fixture = createHostFixture(current);
    const previous = `${JSON.stringify({ sentinel: 'unchanged' })}\n`;
    writeFileSync(join(fixture.directory, 'previous-release.json'), previous);

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

    const commands = readFileSync(fixture.commandLog, 'utf8');
    expect(commands).toContain('docker compose version');
    expect(commands).toContain(`git cat-file -e ${sha}^{commit}`);
    expect(commands).toContain('config --quiet');
    expect(commands).not.toMatch(/git (fetch|checkout)/);
    expect(commands).not.toMatch(/docker .*\b(pull|run|up)\b/);
    expect(commands).not.toContain('curl ');
  });

  it('preflight-only requires the mode-600 backup environment file', () => {
    const fixture = createHostFixture(
      fourImageMetadata({
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
      fourImageMetadata({
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
    const directory = mkdtempSync(join(tmpdir(), 'pressly-deploy-'));
    const envDirectory = writeMode600Env(directory);
    const compose = join(directory, 'compose.yml');
    writeFileSync(compose, 'services: {}\n');
    writeFileSync(join(directory, 'current-release'), `${sha}\n`);
    writeFileSync(
      join(directory, 'current-release.json'),
      `${JSON.stringify(
        fourImageMetadata({
          releaseImages: {
            ...images,
            PRESSLY_PROCESSOR_IMAGE: image('processor', 'e'),
          },
        }),
      )}\n`,
    );

    const result = spawnSync('bash', [deployScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DEPLOY_SHA: sha,
        ...images,
        PRESSLY_APP_ROOT: directory,
        PRESSLY_ENV_DIR: envDirectory,
        PRESSLY_COMPOSE_FILE: compose,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'the source SHA is already associated with a different release',
    );
  });

  it('snapshots the immediate four-image release before a failed upgrade', () => {
    const current = fourImageMetadata({
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

  it('rotates current and previous metadata as one four-image release identity', () => {
    const current = fourImageMetadata({
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
      releaseFormat: 'four-image-v1',
      sourceSha: sha,
      apiImage: images.PRESSLY_API_IMAGE,
      webImage: images.PRESSLY_WEB_IMAGE,
      workerImage: images.PRESSLY_WORKER_IMAGE,
      processorImage: images.PRESSLY_PROCESSOR_IMAGE,
    });
    expect(
      readFileSync(join(fixture.directory, 'current-release'), 'utf8').trim(),
    ).toBe(sha);
    expect(
      readFileSync(fixture.commandLog, 'utf8').match(
        /^docker image inspect /gm,
      ),
    ).toHaveLength(4);
  });

  it('fails before migration when a pulled image revision label mismatches', () => {
    const current = fourImageMetadata({
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
    writeFileSync(metadata, `${JSON.stringify(fourImageMetadata())}\n`);
    writeFileSync(
      stub,
      '#!/bin/sh\nset -eu\nprintf "%s\\n%s\\n%s\\n%s\\n%s\\n%s\\n" "$PRESSLY_TARGET_RELEASE_FORMAT" "$DEPLOY_SHA" "$PRESSLY_API_IMAGE" "$PRESSLY_WEB_IMAGE" "$PRESSLY_WORKER_IMAGE" "$PRESSLY_PROCESSOR_IMAGE" > "$CAPTURE_FILE"\n',
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
    const current = fourImageMetadata({
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
      'curl --fail --silent --show-error https://api.example.test/health/ready',
    );
    expect(commands).toContain(
      'curl --fail --silent --show-error https://web.example.test/health',
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
        releaseFormat: 'four-image-v1',
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
