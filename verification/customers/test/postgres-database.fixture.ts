import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_CUSTOMERS_CONFORMANCE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';

const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });

const urlFor = (name: string): string => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  url.search = '';
  return url.toString();
};

export type CustomerTestDatabase = Readonly<{
  runtime: TestDatabaseRuntime;
  setup: () => Promise<void>;
  teardown: () => Promise<void>;
}>;

export const makeCustomerTestDatabase = (
  input: Readonly<{
    prefix: string;
    tableNames: readonly string[];
    maxConnections: number;
  }>,
): CustomerTestDatabase => {
  const name = `${input.prefix}_test_${process.pid}_${Date.now().toString(36)}`;
  const runtime = createTestDatabaseRuntime({
    databaseUrl: urlFor(name),
    tableNames: input.tableNames,
    maxConnections: input.maxConnections,
  });
  const drop = (): void => {
    run('dropdb', [
      '--maintenance-db',
      adminDatabaseUrl,
      '--if-exists',
      '--force',
      name,
    ]);
  };
  const exists = (): boolean =>
    run('psql', [
      adminDatabaseUrl,
      '-Atqc',
      `select datname from pg_database where datname = '${name}'`,
    ]).trim() === name;

  return Object.freeze({
    runtime,
    setup: async () => {
      drop();
      run('createdb', [
        '--maintenance-db',
        adminDatabaseUrl,
        '--template',
        'template0',
        name,
      ]);
      run('pnpm', ['db:migrate'], {
        ...process.env,
        DATABASE_URL: urlFor(name),
        NODE_ENV: 'test',
      });
      await runtime.check();
    },
    teardown: async () => {
      await runtime.close();
      drop();
      if (exists())
        throw Object.freeze({
          code: 'customer_verification_database_not_removed',
          name,
        });
    },
  });
};
