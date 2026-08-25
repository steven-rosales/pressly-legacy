import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for database role integration tests.`);
};

const runtime = postgres(requiredUrl('PRESSLY_TEST_RUNTIME_DATABASE_URL'), {
  max: 1,
});
const migration = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});
const backup = postgres(requiredUrl('PRESSLY_TEST_BACKUP_DATABASE_URL'), {
  max: 1,
});

afterAll(async () => {
  await Promise.all([runtime.end(), migration.end(), backup.end()]);
});

describe('database roles', () => {
  it('keeps every application role non-privileged and migration-owned objects exact', async () => {
    const roles = await migration`
      select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
             rolreplication, rolbypassrls
      from pg_roles
      where rolname in ('pressly_migration', 'pressly_runtime', 'pressly_backup')
      order by rolname
    `;
    expect(roles).toEqual([
      {
        rolname: 'pressly_backup',
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
      },
      {
        rolname: 'pressly_migration',
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
      },
      {
        rolname: 'pressly_runtime',
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
      },
    ]);

    const [ownership] = await migration`
      select
        (select pg_get_userbyid(datdba) from pg_database where datname = current_database()) as database_owner,
        (
          select count(*)::integer
          from pg_namespace
          where nspname in ('public', 'drizzle')
            and pg_get_userbyid(nspowner) <> 'pressly_migration'
        ) as wrong_schema_owners,
        (
          select count(*)::integer
          from pg_class relation
          join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname in ('public', 'drizzle')
            and relation.relkind in ('r', 'p', 'S', 'v', 'm')
            and pg_get_userbyid(relation.relowner) <> 'pressly_migration'
        ) as wrong_relation_owners,
        (
          select count(*)::integer
          from pg_proc procedure
          join pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname in ('public', 'drizzle')
            and pg_get_userbyid(procedure.proowner) <> 'pressly_migration'
            and not exists (
              select 1
              from pg_depend dependency
              where dependency.classid = 'pg_proc'::regclass
                and dependency.objid = procedure.oid
                and dependency.deptype = 'e'
            )
        ) as wrong_function_owners
    `;
    expect(ownership).toEqual({
      database_owner: 'pressly_migration',
      wrong_schema_owners: 0,
      wrong_relation_owners: 0,
      wrong_function_owners: 0,
    });
  });

  it('allows normal application DML through the runtime role', async () => {
    const email = `db-role-${Date.now()}@pressly.test`;

    await runtime`
      insert into auth_login_attempts (email_normalized, success)
      values (${email}, false)
    `;
    const [stored] = await runtime`
      select email_normalized
      from auth_login_attempts
      where email_normalized = ${email}
    `;
    await runtime`
      delete from auth_login_attempts
      where email_normalized = ${email}
    `;

    expect(stored?.['email_normalized']).toBe(email);
  });

  it('denies DDL and protected role metadata to the runtime role', async () => {
    await expect(
      runtime`create table runtime_role_must_not_create_tables (id integer)`,
    ).rejects.toThrow();
    await expect(runtime`select rolpassword from pg_authid`).rejects.toThrow();
  });

  it('allows schema changes through the migration role', async () => {
    await migration`create table migration_role_probe (id integer)`;
    await migration`drop table migration_role_probe`;
  });

  it('keeps the backup role read-only', async () => {
    await expect(
      backup`select count(*) from auth_identities`,
    ).resolves.toBeDefined();
    await expect(
      backup`select count(*) from drizzle.__drizzle_migrations`,
    ).resolves.toBeDefined();
    await expect(
      backup`select last_value from drizzle.__drizzle_migrations_id_seq`,
    ).resolves.toBeDefined();
    await expect(
      backup`
        insert into auth_login_attempts (email_normalized, success)
        values ('backup-role-write@pressly.test', false)
      `,
    ).rejects.toThrow();
  });
});
