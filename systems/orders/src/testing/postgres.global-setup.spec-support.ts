import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_ORDERS_NATIVE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const runtimeDatabaseTemplate =
  process.env['PRESSLY_ORDERS_LOCAL_PROOF_DATABASE_URL'] ??
  process.env['PRESSLY_TEST_RUNTIME_DATABASE_URL'] ??
  'postgres://pressly_runtime:pressly_runtime_test@localhost:55434/pressly_test';
const resetDatabaseTemplate =
  process.env['PRESSLY_ORDERS_LOCAL_PROOF_DATABASE_RESET_URL'] ??
  process.env['PRESSLY_TEST_MIGRATION_DATABASE_URL'] ??
  'postgres://pressly_migration:pressly_migration_test@localhost:55434/pressly_test';
const migrationRole = decodeURIComponent(
  new URL(resetDatabaseTemplate).username,
);
const runtimeRole = decodeURIComponent(
  new URL(runtimeDatabaseTemplate).username,
);
const databaseName = `pressly_orders_local_proof_test_${process.pid}_${Date.now().toString(36)}`;

const databaseUrl = (template: string): string => {
  const url = new URL(template);
  url.pathname = `/${databaseName}`;
  return url.toString();
};

const runtimeDatabaseUrl = databaseUrl(runtimeDatabaseTemplate);
const resetDatabaseUrl = databaseUrl(resetDatabaseTemplate);

const postgresEnvironment = (value: string): NodeJS.ProcessEnv => {
  const url = new URL(value);
  return {
    ...process.env,
    PGDATABASE: url.pathname.replace(/^\//, ''),
    PGHOST: url.hostname,
    PGPASSWORD: decodeURIComponent(url.password),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
  };
};

const adminEnvironment = postgresEnvironment(adminDatabaseUrl);
const adminDatabaseName = new URL(adminDatabaseUrl).pathname.replace(/^\//, '');
const resetEnvironment = postgresEnvironment(resetDatabaseUrl);

const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });

const dropDatabase = (): void => {
  run(
    'dropdb',
    [
      '--maintenance-db',
      adminDatabaseName,
      '--if-exists',
      '--force',
      databaseName,
    ],
    adminEnvironment,
  );
};

const grantRuntimeAccess = (): void => {
  execFileSync(
    'psql',
    [
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--set',
      `database_name=${databaseName}`,
      '--set',
      `runtime_role=${runtimeRole}`,
      '--file',
      '-',
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: resetEnvironment,
      input: `
GRANT CONNECT ON DATABASE :"database_name" TO :"runtime_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";
`,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180_000,
    },
  );
};

export default function setupOrdersPostgresProof(): () => void {
  dropDatabase();
  run(
    'createdb',
    [
      '--maintenance-db',
      adminDatabaseName,
      '--template',
      'template0',
      '--owner',
      migrationRole,
      databaseName,
    ],
    adminEnvironment,
  );
  run('pnpm', ['db:migrate'], {
    ...process.env,
    DATABASE_URL: resetDatabaseUrl,
    NODE_ENV: 'test',
  });
  grantRuntimeAccess();
  process.env['PRESSLY_ORDERS_LOCAL_PROOF_DATABASE_URL'] = runtimeDatabaseUrl;
  process.env['PRESSLY_ORDERS_LOCAL_PROOF_DATABASE_RESET_URL'] =
    resetDatabaseUrl;

  return dropDatabase;
}
