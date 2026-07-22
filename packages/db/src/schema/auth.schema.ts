import { sql } from 'drizzle-orm';
import {
  boolean,
  bigint,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema.ts';

export const authRoleEnum = pgEnum('auth_role', [
  'owner',
  'admin',
  'operator',
  'customer',
  'driver',
  'service',
  'developer',
  'ci',
]);

export const authScopeKindEnum = pgEnum('auth_scope_kind', [
  'global',
  'location',
  'resource',
]);

export const authAssuranceLevelEnum = pgEnum('auth_assurance_level', [
  'password',
  'mfa',
  'service_key',
]);

export const authMfaStatusEnum = pgEnum('auth_mfa_status', [
  'pending',
  'enabled',
]);

export const authIdentities = pgTable('auth_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  kind: text('kind').notNull(),
  displayName: text('display_name').notNull(),
  email: text('email').unique(),
  emailNormalized: text('email_normalized').unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authPasswordCredentials = pgTable(
  'auth_password_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => authIdentities.id),
    passwordHash: text('password_hash').notNull(),
    passwordUpdatedAt: timestamp('password_updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    identityUnique: uniqueIndex('auth_password_credentials_identity_unique').on(
      table.identityId,
    ),
  }),
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => authIdentities.id),
    tokenHash: text('token_hash').notNull().unique(),
    assuranceLevel: authAssuranceLevelEnum('assurance_level')
      .notNull()
      .default('password'),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    identityIdx: index('auth_sessions_identity_idx').on(table.identityId),
  }),
);

export const authMfaCredentials = pgTable(
  'auth_mfa_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => authIdentities.id),
    encryptedSecret: text('encrypted_secret').notNull(),
    status: authMfaStatusEnum('status').notNull().default('pending'),
    lastUsedCounter: bigint('last_used_counter', { mode: 'number' }),
    enabledAt: timestamp('enabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    identityUnique: uniqueIndex('auth_mfa_credentials_identity_unique').on(
      table.identityId,
    ),
  }),
);

export const authMfaRecoveryCodes = pgTable(
  'auth_mfa_recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => authIdentities.id),
    codeHash: text('code_hash').notNull().unique(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    identityIdx: index('auth_mfa_recovery_codes_identity_idx').on(
      table.identityId,
    ),
  }),
);

export const authMfaChallenges = pgTable(
  'auth_mfa_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => authIdentities.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    identityIdx: index('auth_mfa_challenges_identity_idx').on(table.identityId),
  }),
);

export const authLoginAttempts = pgTable('auth_login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailNormalized: text('email_normalized').notNull(),
  identityId: uuid('identity_id').references(() => authIdentities.id),
  success: boolean('success').notNull(),
  failureCode: text('failure_code'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authAuditEvents = pgTable('auth_audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  principalIdentityId: uuid('principal_identity_id').references(
    () => authIdentities.id,
  ),
  eventType: text('event_type').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authRoleAssignments = pgTable(
  'auth_role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => authIdentities.id),
    role: authRoleEnum('role').notNull(),
    scopeKind: authScopeKindEnum('scope_kind').notNull(),
    scopeId: text('scope_id').notNull().default('*'),
    scopeResourceType: text('scope_resource_type').notNull().default('*'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByIdentityId: uuid('created_by_identity_id').references(
      () => authIdentities.id,
    ),
  },
  (table) => ({
    identityIdx: index('auth_role_assignments_identity_idx').on(
      table.identityId,
    ),
    scopeIdx: index('auth_role_assignments_scope_idx').on(
      table.scopeKind,
      table.scopeId,
    ),
    uniqueAssignment: uniqueIndex('auth_role_assignments_unique_idx').on(
      table.identityId,
      table.role,
      table.scopeKind,
      table.scopeId,
      table.scopeResourceType,
    ),
    scopeShape: check(
      'auth_role_assignments_scope_shape_check',
      sql`
        (
          ${table.scopeKind} = 'resource'
          and ${table.scopeResourceType} <> '*'
        )
        or
        (
          ${table.scopeKind} <> 'resource'
          and ${table.scopeResourceType} = '*'
        )
      `,
    ),
  }),
);
