import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const backupScript = resolve(root, 'deploy/aws/lightsail/backup-postgres.sh');
const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0))
    rmSync(fixture, { recursive: true, force: true });
});

const executable = (path, source) => {
  writeFileSync(path, source);
  chmodSync(path, 0o700);
};

const backupFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'pressly-backup-destinations-'));
  fixtures.push(directory);
  const binDirectory = join(directory, 'bin');
  const envDirectory = join(directory, 'env');
  const backupDirectory = join(directory, 'backups');
  const remoteDirectory = join(directory, 'remote');
  const composeEnv = join(envDirectory, 'compose.env');
  const backupEnv = join(envDirectory, 'backup.env');
  const passphrase = join(directory, 'backup-passphrase.txt');
  const composeFile = join(directory, 'compose.yml');
  const awsCalls = join(directory, 'aws-calls');
  const dockerCalls = join(directory, 'docker-calls');

  for (const path of [
    binDirectory,
    envDirectory,
    backupDirectory,
    remoteDirectory,
  ])
    mkdirSync(path);
  for (const path of [composeEnv, backupEnv, passphrase]) {
    writeFileSync(path, 'fixture\n');
    chmodSync(path, 0o600);
  }
  writeFileSync(composeFile, 'services: {}\n');

  executable(
    join(binDirectory, 'docker'),
    '#!/bin/sh\nset -eu\nprintf "run\\n" >> "$DOCKER_CALLS"\nprintf "synthetic postgres dump\\n"\n',
  );
  executable(join(binDirectory, 'gpg'), '#!/bin/sh\nexec /bin/cat\n');
  executable(
    join(binDirectory, 'aws'),
    `#!/bin/sh
set -eu
profile='<default>'
if [ "\${1:-}" = '--profile' ]; then
  profile="$2"
  shift 2
fi
if [ "\${1:-}" = 's3api' ]; then
  [ "\${2:-}" = 'get-bucket-location' ]
  shift 2
  bucket=''
  expected_owner=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --bucket) bucket="$2"; shift 2 ;;
      --expected-bucket-owner) expected_owner="$2"; shift 2 ;;
      --no-cli-pager) shift ;;
      *) exit 90 ;;
    esac
  done
  printf 'owner\\t%s\\t%s\\ts3://%s\\t-\\t-\\n' \
    "$profile" "$expected_owner" "$bucket" >> "$AWS_CALLS"
  if [ "$expected_owner" = "\${AWS_REJECT_OWNER:-__never__}" ]; then exit 43; fi
  printf '{"LocationConstraint":"us-east-1"}\\n'
  exit 0
fi
[ "\${1:-}" = 's3' ] && [ "\${2:-}" = 'cp' ]
source_path="$3"
destination_path="$4"
shift 4
expected_owner='-'
while [ "$#" -gt 0 ]; do
  case "$1" in
    --only-show-errors) shift ;;
    --expected-bucket-owner)
      expected_owner="$2"
      shift 2
      ;;
    *) exit 91 ;;
  esac
done
case "$source_path|$destination_path" in
  *"\${AWS_FAIL_CONTAINS:-__never__}"*) exit 42 ;;
esac
if [ "$destination_path" = '-' ]; then
  remote_key="$(printf '%s' "$source_path" | sha256sum | cut -d' ' -f1)"
  remote_path="$AWS_REMOTE_DIRECTORY/$remote_key"
  printf 'read\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \
    "$profile" "$expected_owner" "$source_path" "$destination_path" \
    "$remote_path" >> "$AWS_CALLS"
  case "$source_path" in
    "\${AWS_CORRUPT_READ_PREFIX:-__never__}"*) printf 'corrupt readback\\n'; exit 0 ;;
  esac
  exec /bin/cat "$remote_path"
fi
remote_key="$(printf '%s' "$destination_path" | sha256sum | cut -d' ' -f1)"
remote_path="$AWS_REMOTE_DIRECTORY/$remote_key"
/bin/cp "$source_path" "$remote_path"
printf 'write\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \
  "$profile" "$expected_owner" "$source_path" "$destination_path" \
  "$remote_path" >> "$AWS_CALLS"
`,
  );

  return {
    awsCalls,
    backupDirectory,
    directory,
    dockerCalls,
    env: {
      ...process.env,
      AWS_CALLS: awsCalls,
      AWS_REMOTE_DIRECTORY: remoteDirectory,
      DOCKER_CALLS: dockerCalls,
      PATH: `${binDirectory}:${process.env.PATH}`,
      PRESSLY_APP_ROOT: directory,
      PRESSLY_BACKUP_DIR: backupDirectory,
      PRESSLY_BACKUP_ENV_FILE: backupEnv,
      PRESSLY_BACKUP_PASSPHRASE_FILE: passphrase,
      PRESSLY_BACKUP_S3_URI: 's3://primary.example/postgres',
      PRESSLY_COMPOSE_ENV_FILE: composeEnv,
      PRESSLY_COMPOSE_FILE: composeFile,
    },
  };
};

const runBackup = (fixture, env = {}) =>
  spawnSync(backupScript, {
    env: { ...fixture.env, ...env },
    encoding: 'utf8',
  });

const callsFor = (fixture) =>
  readFileSync(fixture.awsCalls, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const [operation, profile, owner, source, destination, remote] =
        line.split('\t');
      return { destination, operation, owner, profile, remote, source };
    });

describe('Postgres backup destinations', () => {
  it('keeps one-destination operation backward compatible', () => {
    const fixture = backupFixture();
    const result = runBackup(fixture);

    expect(result.status).toBe(0);
    expect(readFileSync(fixture.dockerCalls, 'utf8')).toBe('run\n');
    const calls = callsFor(fixture);
    expect(calls.filter(({ operation }) => operation === 'write')).toHaveLength(
      3,
    );
    expect(calls.filter(({ operation }) => operation === 'read')).toHaveLength(
      3,
    );
    expect(calls.every(({ owner }) => owner === '-')).toBe(true);
    expect(calls.every(({ profile }) => profile === '<default>')).toBe(true);
    expect(result.stdout).not.toContain('Secondary backup object:');
    expect(result.stdout).toContain(
      'Every configured destination read back the same encrypted triplet.',
    );
  });

  it('generates once and uploads byte-identical triplets through destination-specific profiles', () => {
    const fixture = backupFixture();
    const result = runBackup(fixture, {
      PRESSLY_BACKUP_AWS_EXPECTED_BUCKET_OWNER: '111111111111',
      PRESSLY_BACKUP_AWS_PROFILE: 'primary-writer',
      PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER: '222222222222',
      PRESSLY_BACKUP_SECONDARY_AWS_PROFILE: 'secondary-writer',
      PRESSLY_BACKUP_SECONDARY_S3_URI: 's3://secondary.example/postgres',
    });

    expect(result.status).toBe(0);
    expect(readFileSync(fixture.dockerCalls, 'utf8')).toBe('run\n');
    const calls = callsFor(fixture);
    const writes = calls.filter(({ operation }) => operation === 'write');
    const reads = calls.filter(({ operation }) => operation === 'read');
    expect(writes).toHaveLength(6);
    expect(reads).toHaveLength(6);

    const primary = writes.filter(({ destination }) =>
      destination.startsWith('s3://primary.example/postgres/'),
    );
    const secondary = writes.filter(({ destination }) =>
      destination.startsWith('s3://secondary.example/postgres/'),
    );
    expect(primary).toHaveLength(3);
    expect(secondary).toHaveLength(3);
    expect(primary.every(({ profile }) => profile === 'primary-writer')).toBe(
      true,
    );
    expect(
      secondary.every(({ profile }) => profile === 'secondary-writer'),
    ).toBe(true);
    expect(calls.filter(({ operation }) => operation === 'owner')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: '111111111111',
          profile: 'primary-writer',
          source: 's3://primary.example',
        }),
        expect.objectContaining({
          owner: '222222222222',
          profile: 'secondary-writer',
          source: 's3://secondary.example',
        }),
      ]),
    );

    const remoteBytes = (call) => readFileSync(call.remote);
    for (const primaryWrite of primary) {
      const suffix = primaryWrite.destination.match(
        /\.dump\.gpg(?<suffix>\.sha256|\.json)?$/,
      )?.groups?.suffix;
      const secondaryWrite = secondary.find(({ destination }) =>
        destination.endsWith(`.dump.gpg${suffix ?? ''}`),
      );
      expect(secondaryWrite).toBeDefined();
      expect(remoteBytes(secondaryWrite)).toEqual(remoteBytes(primaryWrite));
    }
    expect(result.stdout).toContain(
      'Secondary backup object: s3://secondary.example/postgres/',
    );
  });

  it('fails the operation when the configured secondary destination fails', () => {
    const fixture = backupFixture();
    const result = runBackup(fixture, {
      AWS_FAIL_CONTAINS: 's3://secondary.example/postgres/',
      PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER: '222222222222',
      PRESSLY_BACKUP_SECONDARY_S3_URI: 's3://secondary.example/postgres',
    });

    expect(result.status).toBe(1);
    expect(readFileSync(fixture.dockerCalls, 'utf8')).toBe('run\n');
    expect(result.stdout).not.toContain('SHA-256 verified after upload:');
    expect(result.stderr).toContain('secondary upload failed');
    expect(result.stderr).toContain(
      'Backup did not verify at every configured destination.',
    );
    expect(
      readdirSync(fixture.backupDirectory).filter((name) =>
        name.includes('.dump.gpg'),
      ),
    ).toHaveLength(3);
  });

  it('still writes the independent secondary when the primary destination fails', () => {
    const fixture = backupFixture();
    const result = runBackup(fixture, {
      AWS_FAIL_CONTAINS: 's3://primary.example/postgres/',
      PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER: '222222222222',
      PRESSLY_BACKUP_SECONDARY_S3_URI: 's3://secondary.example/postgres',
    });

    expect(result.status).toBe(1);
    const calls = callsFor(fixture);
    expect(
      calls.filter(({ destination }) =>
        destination.startsWith('s3://secondary.example/postgres/'),
      ),
    ).toHaveLength(3);
    expect(
      calls.filter(({ source }) =>
        source.startsWith('s3://secondary.example/postgres/'),
      ),
    ).toHaveLength(3);
    expect(result.stderr).toContain('primary upload failed');
    expect(result.stdout).not.toContain('SHA-256 verified after upload:');
  });

  it('fails when secondary readback differs from the generated bytes', () => {
    const fixture = backupFixture();
    const result = runBackup(fixture, {
      AWS_CORRUPT_READ_PREFIX: 's3://secondary.example/postgres/',
      PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER: '222222222222',
      PRESSLY_BACKUP_SECONDARY_S3_URI: 's3://secondary.example/postgres',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'secondary readback checksum does not match',
    );
    expect(result.stdout).not.toContain('SHA-256 verified after upload:');
  });

  it('rejects a secondary owned by a different AWS account before dumping', () => {
    const fixture = backupFixture();
    const result = runBackup(fixture, {
      AWS_REJECT_OWNER: '222222222222',
      PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER: '222222222222',
      PRESSLY_BACKUP_SECONDARY_AWS_PROFILE: 'secondary-writer',
      PRESSLY_BACKUP_SECONDARY_S3_URI: 's3://secondary.example/postgres',
    });

    expect(result.status).toBe(1);
    expect(existsSync(fixture.dockerCalls)).toBe(false);
    expect(result.stderr).toContain('secondary bucket owner preflight failed');
    expect(result.stderr).toContain('Backup destination preflight failed.');
  });

  it.each([
    [
      {
        PRESSLY_BACKUP_SECONDARY_S3_URI: 's3://secondary.example/postgres',
      },
      'PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER is required',
    ],
    [
      { PRESSLY_BACKUP_SECONDARY_AWS_PROFILE: 'secondary-writer' },
      'Secondary AWS settings require PRESSLY_BACKUP_SECONDARY_S3_URI',
    ],
    [
      {
        PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER: 'not-an-owner',
        PRESSLY_BACKUP_SECONDARY_S3_URI: 's3://secondary.example/postgres',
      },
      'must be a 12-digit AWS account ID',
    ],
    [
      {
        PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER: '222222222222',
        PRESSLY_BACKUP_SECONDARY_S3_URI:
          's3://primary.example/immutable-postgres',
      },
      'must use different S3 buckets',
    ],
  ])('rejects unsafe partial secondary configuration', (env, message) => {
    const fixture = backupFixture();
    const result = runBackup(fixture, env);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(existsSync(fixture.dockerCalls)).toBe(false);
  });
});
