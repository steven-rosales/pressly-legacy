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
const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0))
    rmSync(fixture, { recursive: true, force: true });
});

const executable = (path, source) => {
  writeFileSync(path, source);
  chmodSync(path, 0o700);
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

const monitoredFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'pressly-monitored-operation-'));
  fixtures.push(directory);
  const sentryArgs = join(directory, 'sentry-args');
  const operationMarker = join(directory, 'operation-marker');
  const workerEnv = join(directory, 'worker.env');
  const sentry = join(directory, 'sentry');
  const backup = join(directory, 'backup');
  const capacity = join(directory, 'capacity');

  writeFileSync(workerEnv, 'SENTRY_DSN=https://public@sentry.invalid/1\n');
  chmodSync(workerEnv, 0o600);
  executable(
    sentry,
    '#!/bin/sh\nset -eu\nprintf "%s\\n" "$@" > "$SENTRY_ARGS"\nwhile [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done\nshift\nexec "$@"\n',
  );
  executable(
    backup,
    '#!/bin/sh\nset -eu\nprintf "backup:%s\\n" "$PRESSLY_BACKUP_S3_URI" > "$OPERATION_MARKER"\n',
  );
  executable(
    capacity,
    '#!/bin/sh\nset -eu\nprintf "host-capacity\\n" > "$OPERATION_MARKER"\n',
  );

  return {
    directory,
    operationMarker,
    sentryArgs,
    env: {
      ...process.env,
      OPERATION_MARKER: operationMarker,
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

describe('Sentry-monitored host operations', () => {
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
    expect(args).toContain('flock\n--nonblock\n');
    expect(args).toContain('timeout\n--signal=TERM\n');
    expect(args).toContain('25m\n');
    expect(args).not.toContain('public@sentry.invalid');
  });

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
    expect(args).toContain('1m\n');
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
