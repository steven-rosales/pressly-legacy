import { sql } from 'drizzle-orm';
import {
  boolean,
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

export const authIdentities = pgTable('auth_identites', {
  id: uuid('id').primaryKey().defaultRandom(),
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

export const authPasswordCredentials = pgTable('auth_password_credentials', {
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
});

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id')
    .notNull()
    .references(() => authIdentities.id),
  tokenHash: text('token_hash').notNull().unique(),
  issuedAt: timestamp('issued_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authIdentityRoles = pgTable('auth_identity_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityId: uuid('identity_id')
    .notNull()
    .references(() => authIdentities.id),
  role: authRoleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdByIdentityId: uuid('created_by_identity_id').references(
    () => authIdentities.id,
  ),
});

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
  actorIdentityId: uuid('actor_identity_id').references(
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
