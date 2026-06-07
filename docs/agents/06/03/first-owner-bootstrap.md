# First Owner Bootstrap

## What Changed

- Added a one-time owner bootstrap path in the auth module.
- Added a password hasher to `@pressly/auth`.
- Removed the old database admin seed file.
- Updated the auth plan to describe owner bootstrap instead of admin seeding.

## Where

- Use case: `modules/auth/src/features/bootstrap-owner/*`
- Database adapter: `modules/auth/src/adapters/bootstrap-owner/persistence/bootstrap-owner.repo.ts`
- CLI adapter: `modules/auth/src/adapters/bootstrap-owner/cli/bootstrap-owner.command.ts`
- Root command: `package.json` -> `auth:bootstrap:owner`
- Auth module command: `modules/auth/package.json` -> `bootstrap:owner`
- Password hashing: `packages/auth/src/password-hasher.ts`
- Removed seed: `packages/db/src/seeds/admin.ts`
- Tests:
  - `packages/auth/src/password-hasher.test.ts`
  - `modules/auth/test/features/bootstrap-owner.usecase.test.ts`
  - `modules/auth/test/adapters/bootstrap-owner.repo.int.test.ts`

## Why

- The first owner is now created through auth module code, not a reusable database seed.
- `packages/db` no longer owns Argon2 password hashing for admin creation.
- The new path requires explicit operator input before inserting the first owner.

## Effect

Operators bootstrap the first owner with:

```bash
printf '%s\n' '<password>' \
  | DATABASE_URL='<database-url>' \
    PRESSLY_BOOTSTRAP_OWNER_EMAIL='<owner-email>' \
    PRESSLY_BOOTSTRAP_OWNER_CONFIRM='bootstrap-first-owner' \
    pnpm auth:bootstrap:owner -- --password-stdin
```

The command:

- rejects missing env vars
- rejects missing `--password-stdin`
- rejects invalid email
- rejects weak password
- rejects an existing owner
- rejects an existing identity for the same email

On success, the database transaction creates:

- `auth_identities`
- `auth_password_credentials`
- `auth_identity_roles` with role `owner`
- `auth_audit_events` with event type `auth.owner_bootstrapped`

The insert path also takes a Postgres advisory lock so two owner bootstrap runs do not both create an owner.
