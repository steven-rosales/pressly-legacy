import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const capacityScript = resolve(
  root,
  'infra/aws/lightsail/check-host-capacity.sh',
);
const monitoredOperationScript = resolve(
  root,
  'infra/aws/lightsail/run-monitored-operation.sh',
);
const backupScript = resolve(root, 'infra/aws/lightsail/backup-postgres.sh');
const configureDatabaseRolesScript = resolve(
  root,
  'infra/aws/lightsail/configure-database-roles.sh',
);
const productionCompose = resolve(
  root,
  'infra/aws/lightsail/docker-compose.production.yml',
);
const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0))
    rmSync(fixture, { recursive: true, force: true });
});

const executable = (path, source) => {
  writeFileSync(path, source);
  chmodSync(path, 0o700);
};

const spawnCaptured = (command, args, options) => {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    child.once('error', rejectCompletion);
    child.once('close', (status, signal) => {
      resolveCompletion({ signal, status, stderr, stdout });
    });
  });

  return { child, completion };
};

const waitFor = async (predicate, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  return predicate();
};

const capacityFixture = ({ diskUsed = 35, memoryAvailable = 6144 } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'pressly-host-capacity-'));
  fixtures.push(directory);
  const binDirectory = join(directory, 'bin');
  mkdirSync(binDirectory);
  executable(
    join(binDirectory, 'df'),
    `#!/bin/sh\nprintf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n/dev/root 100 35 65 ${diskUsed}%% /\\n'\n`,
  );
  executable(
    join(binDirectory, 'free'),
    `#!/bin/sh\nprintf '              total used free shared buff/cache available\\nMem:           8192 1000 1000 100 1000 ${memoryAvailable}\\n'\n`,
  );
  return {
    directory,
    env: { ...process.env, PATH: `${binDirectory}:${process.env.PATH}` },
  };
};

const monitoredFixture = ({
  backupExit = 0,
  sentryEchoDsn = false,
  sentryExit,
  workerEnvSource = 'SENTRY_DSN=https://public@sentry.invalid/1\n',
} = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'pressly-monitored-operation-'));
  fixtures.push(directory);
  const sentryArgs = join(directory, 'sentry-args');
  const operationMarker = join(directory, 'operation-marker');
  const secondaryMarker = join(directory, 'secondary-marker');
  const backupMonitorScheduleEnvMarker = join(
    directory,
    'backup-monitor-schedule-env-marker',
  );
  const workerEnv = join(directory, 'worker.env');
  const sentry = join(directory, 'sentry');
  const backup = join(directory, 'backup');
  const capacity = join(directory, 'capacity');

  writeFileSync(workerEnv, workerEnvSource);
  chmodSync(workerEnv, 0o600);
  const sentryEcho = sentryEchoDsn
    ? 'printf "%s\\n" "$SENTRY_DSN"\nprintf "%s\\n" "$SENTRY_DSN" >&2\n'
    : '';
  executable(
    sentry,
    sentryExit === undefined
      ? `#!/bin/sh\nset -eu\nprintf "%s\\n" "$@" > "$SENTRY_ARGS"\n${sentryEcho}while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done\nshift\nexec "$@"\n`
      : `#!/bin/sh\nset -eu\nprintf "%s\\n" "$@" > "$SENTRY_ARGS"\n${sentryEcho}exit ${sentryExit}\n`,
  );
  executable(
    backup,
    `#!/bin/sh\nset -eu\nprintf "backup:%s\\n" "$PRESSLY_BACKUP_S3_URI" > "$OPERATION_MARKER"\nif [ "\${PRESSLY_BACKUP_MONITOR_SCHEDULE+x}" = x ]; then\n  printf "%s" "$PRESSLY_BACKUP_MONITOR_SCHEDULE" > "$BACKUP_MONITOR_SCHEDULE_ENV_MARKER"\nfi\nif [ -n "\${PRESSLY_BACKUP_SECONDARY_S3_URI:-}" ]; then\n  printf "%s|%s|%s\\n" "$PRESSLY_BACKUP_SECONDARY_S3_URI" "$PRESSLY_BACKUP_SECONDARY_AWS_PROFILE" "$PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER" > "$SECONDARY_MARKER"\nfi\nexit ${backupExit}\n`,
  );
  executable(
    capacity,
    '#!/bin/sh\nset -eu\nprintf "host-capacity\\n" > "$OPERATION_MARKER"\n',
  );

  const inheritedEnv = { ...process.env };
  delete inheritedEnv.PRESSLY_BACKUP_MONITOR_SCHEDULE;

  return {
    backupMonitorScheduleEnvMarker,
    directory,
    operationMarker,
    secondaryMarker,
    sentryArgs,
    env: {
      ...inheritedEnv,
      BACKUP_MONITOR_SCHEDULE_ENV_MARKER: backupMonitorScheduleEnvMarker,
      OPERATION_MARKER: operationMarker,
      SECONDARY_MARKER: secondaryMarker,
      PRESSLY_BACKUP_SCRIPT: backup,
      PRESSLY_HOST_CAPACITY_SCRIPT: capacity,
      PRESSLY_SENTRY_BIN: sentry,
      PRESSLY_WORKER_ENV_FILE: workerEnv,
      PRESSLY_OPERATION_LOCK_DIR: join(directory, 'locks'),
      SENTRY_DSN: '',
      SENTRY_ARGS: sentryArgs,
    },
  };
};

const backupFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'pressly-postgres-backup-'));
  fixtures.push(directory);
  const binDirectory = join(directory, 'bin');
  const envDirectory = join(directory, 'env');
  const backupDirectory = join(directory, 'backups');
  const lockDirectory = join(directory, 'locks');
  const composeEnv = join(envDirectory, 'compose.env');
  const backupEnv = join(envDirectory, 'backup.env');
  const passphrase = join(directory, 'backup-passphrase.txt');
  const composeFile = join(directory, 'compose.yml');
  const backupStarts = join(directory, 'backup-starts');
  const backupRelease = join(directory, 'backup-release');
  const remoteBackupDirectory = join(directory, 'remote-backups');

  for (const path of [
    binDirectory,
    envDirectory,
    lockDirectory,
    remoteBackupDirectory,
  ]) {
    mkdirSync(path);
    chmodSync(path, 0o700);
  }
  for (const path of [composeEnv, backupEnv, passphrase]) {
    writeFileSync(path, 'fixture\n');
    chmodSync(path, 0o600);
  }
  writeFileSync(composeFile, 'services: {}\n');

  executable(
    join(binDirectory, 'docker'),
    '#!/bin/sh\nset -eu\nprintf "started\\n" >> "$BACKUP_STARTS"\nwhile [ ! -f "$BACKUP_RELEASE" ]; do sleep 0.01; done\nprintf "synthetic postgres dump\\n"\nexit "${BACKUP_DOCKER_EXIT:-0}"\n',
  );
  executable(join(binDirectory, 'gpg'), '#!/bin/sh\nexec /bin/cat\n');
  executable(
    join(binDirectory, 'aws'),
    '#!/bin/sh\nset -eu\n[ "$1" = "s3" ] && [ "$2" = "cp" ]\nremote_uri="$4"\nif [ "$remote_uri" = "-" ]; then remote_uri="$3"; fi\nremote_key="$(printf "%s" "$remote_uri" | sha256sum | cut -d" " -f1)"\nremote_path="$REMOTE_BACKUP_DIRECTORY/$remote_key"\nif [ "$4" = "-" ]; then exec /bin/cat "$remote_path"; fi\n/bin/cp "$3" "$remote_path"\n',
  );

  return {
    backupDirectory,
    backupRelease,
    backupStarts,
    directory,
    lockDirectory,
    env: {
      ...process.env,
      BACKUP_RELEASE: backupRelease,
      BACKUP_STARTS: backupStarts,
      PATH: `${binDirectory}:${process.env.PATH}`,
      PRESSLY_APP_ROOT: directory,
      PRESSLY_BACKUP_DIR: backupDirectory,
      PRESSLY_BACKUP_ENV_FILE: backupEnv,
      PRESSLY_BACKUP_PASSPHRASE_FILE: passphrase,
      PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
      PRESSLY_COMPOSE_ENV_FILE: composeEnv,
      PRESSLY_COMPOSE_FILE: composeFile,
      PRESSLY_OPERATION_LOCK_DIR: lockDirectory,
      REMOTE_BACKUP_DIRECTORY: remoteBackupDirectory,
    },
  };
};

describe('host capacity check', () => {
  it('accepts healthy disk and available memory', () => {
    const fixture = capacityFixture();
    const result = spawnSync(capacityScript, {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('disk=35%');
    expect(result.stdout).toContain('memory_available=6144MiB');
  });

  it.each([
    [{ diskUsed: 80, memoryAvailable: 6144 }, 'disk=80%'],
    [{ diskUsed: 35, memoryAvailable: 511 }, 'memory_available=511MiB'],
  ])('rejects an exceeded capacity threshold', (values, signal) => {
    const fixture = capacityFixture(values);
    const result = spawnSync(capacityScript, {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Host capacity threshold exceeded');
    expect(result.stderr).toContain(signal);
  });

  it('rejects invalid threshold configuration', () => {
    const fixture = capacityFixture();
    const result = spawnSync(capacityScript, {
      env: {
        ...fixture.env,
        PRESSLY_HOST_DISK_USED_LIMIT_PERCENT: '101',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must not exceed 100');
  });

  it.each(['080', '0512'])(
    'rejects leading-zero threshold configuration: %s',
    (threshold) => {
      const fixture = capacityFixture();
      const result = spawnSync(capacityScript, {
        env: {
          ...fixture.env,
          PRESSLY_HOST_DISK_USED_LIMIT_PERCENT: threshold,
        },
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('canonical positive integer');
    },
  );
});

describe('Postgres backup serialization', () => {
  it('refuses a direct backup while a durable restore journal remains', () => {
    const fixture = backupFixture();
    writeFileSync(
      join(fixture.directory, 'postgres-restore.json'),
      '{"phase":"validated"}\n',
    );
    writeFileSync(fixture.backupRelease, 'release\n');

    const result = spawnSync(backupScript, {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(75);
    expect(result.stderr).toContain(
      'Active Postgres restore journal blocks backup',
    );
    expect(existsSync(fixture.backupStarts)).toBe(false);
  });

  it('rejects a second direct backup while the first direct backup holds the lock', async () => {
    const fixture = backupFixture();
    const first = spawnCaptured(backupScript, [], { env: fixture.env });
    const firstStarted = await waitFor(() => existsSync(fixture.backupStarts));

    if (!firstStarted) {
      writeFileSync(fixture.backupRelease, 'release\n');
      const firstResult = await first.completion;
      expect(firstResult).toMatchObject({ status: 0 });
      expect(firstStarted).toBe(true);
      return;
    }

    const secondRelease = join(fixture.directory, 'second-backup-release');
    writeFileSync(secondRelease, 'release\n');
    let secondResult;
    try {
      secondResult = spawnSync(backupScript, {
        env: {
          ...fixture.env,
          BACKUP_RELEASE: secondRelease,
          PRESSLY_BACKUP_DIR: join(fixture.directory, 'second-backups'),
        },
        encoding: 'utf8',
      });
    } finally {
      writeFileSync(fixture.backupRelease, 'release\n');
    }
    const firstResult = await first.completion;

    expect(firstResult.status).toBe(0);
    expect(secondResult?.status).toBe(75);
    expect(secondResult?.stderr).toContain(
      'Another Postgres backup or restore is already running',
    );
    expect(readFile(fixture.backupStarts)).toBe('started\n');
  });

  it('rejects a direct backup while a restore-style descriptor holds the shared lock', async () => {
    const fixture = backupFixture();
    const restoreReady = join(fixture.directory, 'restore-lock-ready');
    const restoreRelease = join(fixture.directory, 'restore-lock-release');
    const restoreHolder = join(fixture.directory, 'restore-lock-holder');
    executable(
      restoreHolder,
      '#!/bin/sh\nset -eu\nexec 8> "$BACKUP_LOCK_FILE"\nif ! flock --nonblock 8; then exit 75; fi\nprintf "ready\\n" > "$RESTORE_LOCK_READY"\nwhile [ ! -f "$RESTORE_LOCK_RELEASE" ]; do sleep 0.01; done\n',
    );
    const holder = spawnCaptured(restoreHolder, [], {
      env: {
        ...fixture.env,
        BACKUP_LOCK_FILE: join(fixture.lockDirectory, 'postgres-backup.lock'),
        RESTORE_LOCK_READY: restoreReady,
        RESTORE_LOCK_RELEASE: restoreRelease,
      },
    });
    const holderReady = await waitFor(() => existsSync(restoreReady));

    if (!holderReady) {
      writeFileSync(restoreRelease, 'release\n');
      const holderResult = await holder.completion;
      expect(holderResult).toMatchObject({ status: 0 });
      expect(holderReady).toBe(true);
      return;
    }

    writeFileSync(fixture.backupRelease, 'release\n');
    let directResult;
    try {
      directResult = spawnSync(backupScript, {
        env: fixture.env,
        encoding: 'utf8',
      });
    } finally {
      writeFileSync(restoreRelease, 'release\n');
    }
    const holderResult = await holder.completion;

    expect(holderResult.status).toBe(0);
    expect(directResult?.status).toBe(75);
    expect(directResult?.stderr).toContain(
      'Another Postgres backup or restore is already running',
    );
    expect(existsSync(fixture.backupStarts)).toBe(false);
  });

  it('lets the payload acquire the shared lock when called by the monitored runner', () => {
    const fixture = backupFixture();
    writeFileSync(fixture.backupRelease, 'release\n');
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_SCRIPT: backupScript,
        PRESSLY_SENTRY_BIN: '/missing/sentry',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.backupStarts)).toBe('started\n');
    expect(result.stderr).toContain('Sentry check-in skipped');
  });

  it('keeps a partial encrypted artifact private when backup creation fails', () => {
    const fixture = backupFixture();
    writeFileSync(fixture.backupRelease, 'release\n');

    const previousUmask = process.umask(0o022);
    let result;
    try {
      result = spawnSync(backupScript, {
        env: { ...fixture.env, BACKUP_DOCKER_EXIT: '41' },
        encoding: 'utf8',
      });
    } finally {
      process.umask(previousUmask);
    }

    expect(result.status).toBe(41);
    const artifacts = readdirSync(fixture.backupDirectory).filter((name) =>
      name.endsWith('.dump.gpg'),
    );
    expect(artifacts).toHaveLength(1);
    expect(
      statSync(join(fixture.backupDirectory, artifacts[0])).mode & 0o777,
    ).toBe(0o600);
  });
});

describe('durable restore exclusion', () => {
  it('refuses direct database-role changes while a candidate is promoted', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-role-restore-gate-'));
    fixtures.push(directory);
    const lockDirectory = join(directory, 'locks');
    const dockerMarker = join(directory, 'docker-called');
    const binDirectory = join(directory, 'bin');
    mkdirSync(lockDirectory);
    mkdirSync(binDirectory);
    executable(
      join(binDirectory, 'docker'),
      '#!/bin/sh\nprintf "called\\n" > "$DOCKER_MARKER"\n',
    );
    writeFileSync(
      join(directory, 'postgres-restore.json'),
      '{"phase":"candidate_promoted"}\n',
    );

    const result = spawnSync(configureDatabaseRolesScript, {
      env: {
        ...process.env,
        DOCKER_MARKER: dockerMarker,
        PATH: `${binDirectory}:${process.env.PATH}`,
        PRESSLY_APP_ROOT: directory,
        PRESSLY_DEPLOY_LOCK_FILE: join(directory, 'deploy.lock'),
        PRESSLY_OPERATION_LOCK_DIR: lockDirectory,
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(75);
    expect(result.stderr).toContain(
      'Active Postgres restore journal blocks database role changes',
    );
    expect(existsSync(dockerMarker)).toBe(false);
  });

  it('refuses direct database-role changes for a dangling restore journal', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-role-restore-gate-'));
    fixtures.push(directory);
    const lockDirectory = join(directory, 'locks');
    const dockerMarker = join(directory, 'docker-called');
    const binDirectory = join(directory, 'bin');
    mkdirSync(lockDirectory);
    mkdirSync(binDirectory);
    executable(
      join(binDirectory, 'docker'),
      '#!/bin/sh\nprintf "called\\n" > "$DOCKER_MARKER"\n',
    );
    symlinkSync(
      join(directory, 'missing-restore-journal'),
      join(directory, 'postgres-restore.json'),
    );

    const result = spawnSync(configureDatabaseRolesScript, {
      env: {
        ...process.env,
        DOCKER_MARKER: dockerMarker,
        PATH: `${binDirectory}:${process.env.PATH}`,
        PRESSLY_APP_ROOT: directory,
        PRESSLY_DEPLOY_LOCK_FILE: join(directory, 'deploy.lock'),
        PRESSLY_OPERATION_LOCK_DIR: lockDirectory,
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(75);
    expect(result.stderr).toContain(
      'Active Postgres restore journal blocks database role changes',
    );
    expect(existsSync(dockerMarker)).toBe(false);
  });
});

describe('Sentry-monitored host operations', () => {
  it.each([
    ['backup payload', backupScript],
    ['database-role bootstrap', configureDatabaseRolesScript],
  ])('supplies every required Compose binding for the %s', (_, script) => {
    const source = readFile(script);
    const compose = readFile(productionCompose);
    const requiredBindings = new Set(
      [...compose.matchAll(/\$\{(PRESSLY_[A-Z0-9_]+):\?[^}]+\}/g)].map(
        ([, binding]) => binding,
      ),
    );

    expect(requiredBindings.size).toBeGreaterThan(0);
    for (const binding of requiredBindings) {
      const exportMatch = source.match(
        new RegExp(`export ${binding}="\\$\\{${binding}:-([^}]+)\\}"`),
      );
      expect(
        exportMatch,
        `${binding} needs a nonempty fallback in ${script}`,
      ).not.toBe(null);

      const fallback = exportMatch?.[1]?.trim() ?? '';
      expect(fallback).not.toBe('');
      const referencedBinding = fallback.match(/^\$([A-Z][A-Z0-9_]*)$/)?.[1];
      if (referencedBinding) {
        expect(source).toMatch(
          new RegExp(`^${referencedBinding}=(['"])[^'"]+\\1$`, 'm'),
        );
      }
    }
  });

  it('reports backup success only after the backup command exits successfully', () => {
    const fixture = monitoredFixture();
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.operationMarker)).toBe(
      'backup:s3://backup.example/postgres\n',
    );
    const args = readFile(fixture.sentryArgs);
    expect(args).toContain('pressly-postgres-backup\n');
    expect(args).toContain('15 3 * * *\n');
    expect(args).toContain('--failure-issue-threshold\n1\n');
    expect(args).toContain('sh\n-c\n');
    expect(args).toContain('sentry-check-in\n0\n');
    expect(args).not.toContain('public@sentry.invalid');
    expect(existsSync(fixture.backupMonitorScheduleEnvMarker)).toBe(false);
  });

  it('uses an approved hourly schedule only for the backup monitor check-in', () => {
    const fixture = monitoredFixture();
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_MONITOR_SCHEDULE: '15 * * * *',
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.operationMarker)).toBe(
      'backup:s3://backup.example/postgres\n',
    );
    const args = readFile(fixture.sentryArgs);
    expect(args).toContain('--schedule\n15 * * * *\n');
    expect(args).not.toContain('15 3 * * *');
    expect(existsSync(fixture.backupMonitorScheduleEnvMarker)).toBe(false);
    expect(`${result.stdout}${result.stderr}`).not.toContain('15 * * * *');
  });

  it.each(['', 'private-schedule-sentinel', '0 * * * *', '15 03 * * *'])(
    'skips telemetry for a malformed backup monitor schedule: %j',
    (malformedSchedule) => {
      const fixture = monitoredFixture();
      const result = spawnSync(monitoredOperationScript, ['backup'], {
        env: {
          ...fixture.env,
          PRESSLY_BACKUP_MONITOR_SCHEDULE: malformedSchedule,
          PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
        },
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(readFile(fixture.operationMarker)).toBe(
        'backup:s3://backup.example/postgres\n',
      );
      expect(existsSync(fixture.sentryArgs)).toBe(false);
      expect(existsSync(fixture.backupMonitorScheduleEnvMarker)).toBe(false);
      expect(result.stderr).toContain(
        'Sentry check-in skipped: PRESSLY_BACKUP_MONITOR_SCHEDULE',
      );
      if (malformedSchedule) {
        expect(`${result.stdout}${result.stderr}`).not.toContain(
          malformedSchedule,
        );
      }
    },
  );

  it('rejects a multiline backup monitor schedule without leaking its value', () => {
    const malformedSchedule = '15 * * * *\nprivate-monitor-schedule-sentinel';
    const fixture = monitoredFixture();
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_MONITOR_SCHEDULE: malformedSchedule,
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.operationMarker)).toBe(
      'backup:s3://backup.example/postgres\n',
    );
    expect(existsSync(fixture.sentryArgs)).toBe(false);
    expect(existsSync(fixture.backupMonitorScheduleEnvMarker)).toBe(false);
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      'private-monitor-schedule-sentinel',
    );
  });

  it.each([0, 42, 124])(
    'preserves backup exit %i when the monitor schedule is invalid',
    (backupExit) => {
      const fixture = monitoredFixture({ backupExit });
      const result = spawnSync(monitoredOperationScript, ['backup'], {
        env: {
          ...fixture.env,
          PRESSLY_BACKUP_MONITOR_SCHEDULE: 'invalid-schedule-sentinel',
          PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
        },
        encoding: 'utf8',
      });

      expect(result.status).toBe(backupExit);
      expect(readFile(fixture.operationMarker)).toBe(
        'backup:s3://backup.example/postgres\n',
      );
      expect(existsSync(fixture.sentryArgs)).toBe(false);
      expect(`${result.stdout}${result.stderr}`).not.toContain(
        'invalid-schedule-sentinel',
      );
    },
  );

  it('does not apply the backup monitor schedule to host-capacity check-ins', () => {
    const fixture = monitoredFixture();
    const result = spawnSync(monitoredOperationScript, ['host-capacity'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_MONITOR_SCHEDULE: '15 * * * *',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const args = readFile(fixture.sentryArgs);
    expect(args).toContain('--schedule\n*/5 * * * *\n');
    expect(args).not.toContain('15 * * * *');
  });

  it('preserves secondary destination selection through the monitored runner', () => {
    const fixture = monitoredFixture();
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
        PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER: '222222222222',
        PRESSLY_BACKUP_SECONDARY_AWS_PROFILE: 'secondary-writer',
        PRESSLY_BACKUP_SECONDARY_S3_URI: 's3://immutable.example/postgres',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.secondaryMarker)).toBe(
      's3://immutable.example/postgres|secondary-writer|222222222222\n',
    );
  });

  it('preserves a backup failure after reporting it to Sentry', () => {
    const fixture = monitoredFixture({ backupExit: 42 });
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(42);
    expect(readFile(fixture.operationMarker)).toBe(
      'backup:s3://backup.example/postgres\n',
    );
    expect(readFile(fixture.sentryArgs)).toContain('sentry-check-in\n200\n');
    expect(result.stderr).not.toContain('Sentry check-in failed');
  });

  it.each([1, 124])(
    'does not confuse Sentry CLI exit %i with a delivered operation failure',
    (collidingExit) => {
      const fixture = monitoredFixture({
        backupExit: collidingExit,
        sentryExit: collidingExit,
      });
      const result = spawnSync(monitoredOperationScript, ['backup'], {
        env: {
          ...fixture.env,
          PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
        },
        encoding: 'utf8',
      });

      expect(result.status).toBe(collidingExit);
      expect(readFile(fixture.operationMarker)).toBe(
        'backup:s3://backup.example/postgres\n',
      );
      expect(result.stderr).toContain('Sentry check-in failed');
    },
  );

  it.each([
    ['missing Sentry CLI', { PRESSLY_SENTRY_BIN: '/missing/sentry' }],
    [
      'missing Worker environment',
      { PRESSLY_WORKER_ENV_FILE: '/missing/worker.env' },
    ],
  ])('runs a successful backup without %s', (_, overrides) => {
    const fixture = monitoredFixture();
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        ...overrides,
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.operationMarker)).toBe(
      'backup:s3://backup.example/postgres\n',
    );
    expect(result.stderr).toContain('Sentry check-in skipped');
    expect(result.stderr).not.toContain('public@sentry.invalid');
  });

  it('runs a successful backup when the Worker environment has no DSN', () => {
    const fixture = monitoredFixture({
      workerEnvSource: 'NODE_ENV=production\n',
    });
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.operationMarker)).toBe(
      'backup:s3://backup.example/postgres\n',
    );
    expect(result.stderr).toContain('Missing SENTRY_DSN entry');
    expect(result.stderr).toContain('Sentry check-in skipped');
  });

  it('rejects a malformed DSN without exposing it or blocking backup', () => {
    const malformedDsn = 'https://synthetic-public-key@missing-project';
    const fixture = monitoredFixture({
      sentryEchoDsn: true,
      workerEnvSource: `SENTRY_DSN=${malformedDsn}\n`,
    });
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.operationMarker)).toBe(
      'backup:s3://backup.example/postgres\n',
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(malformedDsn);
    expect(result.stderr).toContain('SENTRY_DSN is malformed');
  });

  it('suppresses a noisy Sentry CLI and preserves the backup exit', () => {
    const syntheticDsn = 'https://synthetic-public-key@o0.ingest.sentry.io/1';
    const fixture = monitoredFixture({
      backupExit: 42,
      sentryEchoDsn: true,
      sentryExit: 73,
      workerEnvSource: `SENTRY_DSN=${syntheticDsn}\n`,
    });
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(42);
    expect(readFile(fixture.operationMarker)).toBe(
      'backup:s3://backup.example/postgres\n',
    );
    expect(readFile(fixture.sentryArgs)).toContain('pressly-postgres-backup\n');
    expect(`${result.stdout}${result.stderr}`).not.toContain(syntheticDsn);
    expect(result.stderr).toContain('Sentry check-in failed');
  });

  it('runs a successful backup with invalid telemetry timeout configuration', () => {
    const fixture = monitoredFixture();
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: {
        ...fixture.env,
        PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
        PRESSLY_SENTRY_TIMEOUT: 'invalid',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.operationMarker)).toBe(
      'backup:s3://backup.example/postgres\n',
    );
    expect(result.stderr).toContain('Sentry check-in skipped');
  });

  it.each([
    [0, 0],
    [42, 42],
  ])(
    'preserves backup exit %i when the Sentry CLI fails',
    (backupExit, expectedExit) => {
      const fixture = monitoredFixture({ backupExit, sentryExit: 73 });
      const result = spawnSync(monitoredOperationScript, ['backup'], {
        env: {
          ...fixture.env,
          PRESSLY_BACKUP_S3_URI: 's3://backup.example/postgres',
        },
        encoding: 'utf8',
      });

      expect(result.status).toBe(expectedExit);
      expect(readFile(fixture.operationMarker)).toBe(
        'backup:s3://backup.example/postgres\n',
      );
      expect(result.stderr).toContain('Sentry check-in failed');
    },
  );

  it('uses consecutive failures for host-capacity alerting', () => {
    const fixture = monitoredFixture();
    const result = spawnSync(monitoredOperationScript, ['host-capacity'], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readFile(fixture.operationMarker)).toBe('host-capacity\n');
    const args = readFile(fixture.sentryArgs);
    expect(args).toContain('pressly-host-capacity\n');
    expect(args).toContain('*/5 * * * *\n');
    expect(args).toContain('--failure-issue-threshold\n3\n');
    expect(args).toContain('sentry-check-in\n0\n');
  });

  it('fails closed without a backup destination', () => {
    const fixture = monitoredFixture();
    const result = spawnSync(monitoredOperationScript, ['backup'], {
      env: fixture.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PRESSLY_BACKUP_S3_URI');
    expect(result.stderr).not.toContain('public@sentry.invalid');
  });

  it('terminates a hung operation before the Sentry maximum runtime', () => {
    const fixture = monitoredFixture();
    const slowCapacity = join(fixture.directory, 'slow-capacity');
    executable(slowCapacity, '#!/bin/sh\nsleep 30\n');
    const result = spawnSync(monitoredOperationScript, ['host-capacity'], {
      env: {
        ...fixture.env,
        PRESSLY_HOST_CAPACITY_TIMEOUT: '1s',
        PRESSLY_HOST_CAPACITY_SCRIPT: slowCapacity,
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(124);
  });
});

const readFile = (path) => readFileSync(path, 'utf8');
