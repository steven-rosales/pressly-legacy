\set ON_ERROR_STOP on

SELECT format(
  'CREATE ROLE pressly_migration LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'migration_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pressly_migration')
\gexec

SELECT format(
  'CREATE ROLE pressly_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pressly_runtime')
\gexec

SELECT format(
  'CREATE ROLE pressly_backup LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'backup_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pressly_backup')
\gexec

ALTER ROLE pressly_migration PASSWORD :'migration_password';
ALTER ROLE pressly_runtime PASSWORD :'runtime_password';
ALTER ROLE pressly_backup PASSWORD :'backup_password';

ALTER DATABASE :"database_name" OWNER TO pressly_migration;
ALTER SCHEMA public OWNER TO pressly_migration;

SELECT format('ALTER SCHEMA %I OWNER TO pressly_migration', schema_name)
FROM information_schema.schemata
WHERE schema_name = 'drizzle'
\gexec

SELECT format('ALTER TABLE %I.%I OWNER TO pressly_migration', schemaname, tablename)
FROM pg_tables
WHERE schemaname IN ('public', 'drizzle')
\gexec

SELECT format('ALTER SEQUENCE %I.%I OWNER TO pressly_migration', sequence_schema, sequence_name)
FROM information_schema.sequences
WHERE sequence_schema IN ('public', 'drizzle')
\gexec

SELECT format('ALTER TYPE %I.%I OWNER TO pressly_migration', namespace.nspname, type.typname)
FROM pg_type type
JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
WHERE namespace.nspname = 'public'
  AND type.typtype IN ('d', 'e')
\gexec

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;

GRANT CONNECT ON DATABASE :"database_name" TO pressly_migration;
GRANT CONNECT ON DATABASE :"database_name" TO pressly_runtime;
GRANT CONNECT ON DATABASE :"database_name" TO pressly_backup;

GRANT USAGE ON SCHEMA public TO pressly_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pressly_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pressly_runtime;

GRANT USAGE ON SCHEMA public TO pressly_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pressly_backup;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pressly_backup;

SELECT 'GRANT USAGE ON SCHEMA drizzle TO pressly_backup'
WHERE EXISTS (
  SELECT 1
  FROM information_schema.schemata
  WHERE schema_name = 'drizzle'
)
\gexec

SELECT 'GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO pressly_backup'
WHERE EXISTS (
  SELECT 1
  FROM information_schema.schemata
  WHERE schema_name = 'drizzle'
)
\gexec

SELECT 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO pressly_backup'
WHERE EXISTS (
  SELECT 1
  FROM information_schema.schemata
  WHERE schema_name = 'drizzle'
)
\gexec

ALTER DEFAULT PRIVILEGES FOR ROLE pressly_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pressly_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE pressly_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pressly_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE pressly_migration IN SCHEMA public
  GRANT SELECT ON TABLES TO pressly_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE pressly_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pressly_backup;

SELECT 'ALTER DEFAULT PRIVILEGES FOR ROLE pressly_migration IN SCHEMA drizzle GRANT SELECT ON TABLES TO pressly_backup'
WHERE EXISTS (
  SELECT 1
  FROM information_schema.schemata
  WHERE schema_name = 'drizzle'
)
\gexec

SELECT 'ALTER DEFAULT PRIVILEGES FOR ROLE pressly_migration IN SCHEMA drizzle GRANT USAGE, SELECT ON SEQUENCES TO pressly_backup'
WHERE EXISTS (
  SELECT 1
  FROM information_schema.schemata
  WHERE schema_name = 'drizzle'
)
\gexec

ALTER ROLE pressly_runtime IN DATABASE :"database_name" SET statement_timeout = '15s';
ALTER ROLE pressly_runtime IN DATABASE :"database_name" SET lock_timeout = '3s';
ALTER ROLE pressly_runtime IN DATABASE :"database_name" SET idle_in_transaction_session_timeout = '10s';

ALTER ROLE pressly_migration IN DATABASE :"database_name" SET statement_timeout = '0';
ALTER ROLE pressly_migration IN DATABASE :"database_name" SET lock_timeout = '10s';
ALTER ROLE pressly_migration IN DATABASE :"database_name" SET idle_in_transaction_session_timeout = '60s';

ALTER ROLE pressly_backup IN DATABASE :"database_name" SET default_transaction_read_only = on;
ALTER ROLE pressly_backup IN DATABASE :"database_name" SET statement_timeout = '0';
ALTER ROLE pressly_backup IN DATABASE :"database_name" SET idle_in_transaction_session_timeout = '60s';
