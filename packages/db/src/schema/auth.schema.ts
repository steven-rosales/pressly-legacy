import { sql } from 'drizzle-orm';
import {
  boolean,
  bigint,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { businessAccounts, productionLocations } from './business.schema.ts';
import { users } from './users.schema.ts';

export const authRoleEnum = pgEnum('auth_role', [
  'owner',
  'manager',
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
  'business',
  'location',
  'resource',
]);

export const workforceMembershipStateEnum = pgEnum(
  'workforce_membership_state',
  ['active', 'suspended', 'ended'],
);

export const workforceInvitationStateEnum = pgEnum(
  'workforce_invitation_state',
  ['pending', 'accepted', 'revoked', 'expired'],
);

export const authAccessGrantStateEnum = pgEnum('auth_access_grant_state', [
  'active',
  'revoked',
  'expired',
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
  businessId: uuid('business_id').references(() => businessAccounts.id),
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

export const workforceMemberships = pgTable(
  'workforce_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businessAccounts.id),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => authIdentities.id),
    state: workforceMembershipStateEnum('state').notNull().default('active'),
    version: integer('version').notNull().default(1),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedByIdentityId: uuid('suspended_by_identity_id').references(
      () => authIdentities.id,
    ),
    suspensionReason: text('suspension_reason'),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endedByIdentityId: uuid('ended_by_identity_id').references(
      () => authIdentities.id,
    ),
    endReason: text('end_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('workforce_memberships_id_business_identity_unique').on(
      table.id,
      table.businessId,
      table.identityId,
    ),
    uniqueIndex('workforce_memberships_one_current_per_identity_unique')
      .on(table.businessId, table.identityId)
      .where(sql`${table.state} in ('active', 'suspended')`),
    index('workforce_memberships_business_state_idx').on(
      table.businessId,
      table.state,
      table.createdAt,
    ),
    check('workforce_memberships_positive_version', sql`${table.version} > 0`),
    check(
      'workforce_memberships_suspension_tuple',
      sql`(${table.suspendedAt} is null and ${table.suspendedByIdentityId} is null and ${table.suspensionReason} is null) or (${table.suspendedAt} is not null and ${table.suspendedByIdentityId} is not null and length(btrim(${table.suspensionReason})) > 0)`,
    ),
    check(
      'workforce_memberships_end_tuple',
      sql`(${table.endedAt} is null and ${table.endedByIdentityId} is null and ${table.endReason} is null) or (${table.endedAt} is not null and ${table.endedByIdentityId} is not null and length(btrim(${table.endReason})) > 0)`,
    ),
    check(
      'workforce_memberships_state_timestamps_valid',
      sql`(${table.state} = 'active' and ${table.suspendedAt} is null and ${table.endedAt} is null) or (${table.state} = 'suspended' and ${table.suspendedAt} is not null and ${table.endedAt} is null) or (${table.state} = 'ended' and ${table.endedAt} is not null)`,
    ),
  ],
);

export const workforceInvitations = pgTable(
  'workforce_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businessAccounts.id),
    emailNormalized: text('email_normalized').notNull(),
    displayName: text('display_name').notNull(),
    intendedRole: text('intended_role').notNull(),
    intendedLocationId: text('intended_location_id'),
    state: workforceInvitationStateEnum('state').notNull().default('pending'),
    version: integer('version').notNull().default(1),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByIdentityId: uuid('accepted_by_identity_id').references(
      () => authIdentities.id,
    ),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByIdentityId: uuid('revoked_by_identity_id').references(
      () => authIdentities.id,
    ),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    createdByIdentityId: uuid('created_by_identity_id')
      .notNull()
      .references(() => authIdentities.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('workforce_invitations_token_hash_unique').on(table.tokenHash),
    uniqueIndex('workforce_invitations_one_pending_email_unique')
      .on(table.businessId, table.emailNormalized)
      .where(sql`${table.state} = 'pending'`),
    index('workforce_invitations_business_state_idx').on(
      table.businessId,
      table.state,
      table.createdAt,
    ),
    foreignKey({
      name: 'workforce_invitations_location_business_fk',
      columns: [table.intendedLocationId, table.businessId],
      foreignColumns: [productionLocations.id, productionLocations.businessId],
    }),
    check('workforce_invitations_positive_version', sql`${table.version} > 0`),
    check(
      'workforce_invitations_email_normalized',
      sql`${table.emailNormalized} = lower(btrim(${table.emailNormalized})) and length(${table.emailNormalized}) > 3`,
    ),
    check(
      'workforce_invitations_token_hash_shape',
      sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'workforce_invitations_role_scope_valid',
      sql`(${table.intendedRole} in ('owner', 'manager') and (${table.intendedLocationId} is null or length(btrim(${table.intendedLocationId})) > 0)) or (${table.intendedRole} = 'operator' and ${table.intendedLocationId} is not null and length(btrim(${table.intendedLocationId})) > 0)`,
    ),
    check(
      'workforce_invitations_expiry_valid',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'workforce_invitations_state_timestamps_valid',
      sql`(${table.state} = 'pending' and ${table.acceptedAt} is null and ${table.acceptedByIdentityId} is null and ${table.revokedAt} is null and ${table.revokedByIdentityId} is null and ${table.expiredAt} is null) or (${table.state} = 'accepted' and ${table.acceptedAt} is not null and ${table.acceptedByIdentityId} is not null and ${table.revokedAt} is null and ${table.revokedByIdentityId} is null and ${table.expiredAt} is null) or (${table.state} = 'revoked' and ${table.acceptedAt} is null and ${table.acceptedByIdentityId} is null and ${table.revokedAt} is not null and ${table.revokedByIdentityId} is not null and ${table.expiredAt} is null) or (${table.state} = 'expired' and ${table.acceptedAt} is null and ${table.acceptedByIdentityId} is null and ${table.revokedAt} is null and ${table.revokedByIdentityId} is null and ${table.expiredAt} is not null)`,
    ),
  ],
);

export const authAccessGrants = pgTable(
  'auth_access_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businessAccounts.id),
    membershipId: uuid('membership_id').notNull(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => authIdentities.id),
    role: text('role').notNull(),
    scopeKind: text('scope_kind').notNull(),
    scopeId: text('scope_id').notNull(),
    scopeResourceType: text('scope_resource_type').notNull().default('*'),
    locationId: text('location_id'),
    state: authAccessGrantStateEnum('state').notNull().default('active'),
    version: integer('version').notNull().default(1),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByIdentityId: uuid('revoked_by_identity_id').references(
      () => authIdentities.id,
    ),
    revocationReason: text('revocation_reason'),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    createdByIdentityId: uuid('created_by_identity_id')
      .notNull()
      .references(() => authIdentities.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_access_grants_id_business_identity_unique').on(
      table.id,
      table.businessId,
      table.identityId,
    ),
    uniqueIndex('auth_access_grants_one_active_scope_unique')
      .on(
        table.membershipId,
        table.role,
        table.scopeKind,
        table.scopeId,
        table.scopeResourceType,
      )
      .where(sql`${table.state} = 'active'`),
    index('auth_access_grants_identity_state_idx').on(
      table.identityId,
      table.state,
    ),
    index('auth_access_grants_business_scope_idx').on(
      table.businessId,
      table.scopeKind,
      table.scopeId,
      table.state,
    ),
    foreignKey({
      name: 'auth_access_grants_membership_business_identity_fk',
      columns: [table.membershipId, table.businessId, table.identityId],
      foreignColumns: [
        workforceMemberships.id,
        workforceMemberships.businessId,
        workforceMemberships.identityId,
      ],
    }),
    foreignKey({
      name: 'auth_access_grants_location_business_fk',
      columns: [table.locationId, table.businessId],
      foreignColumns: [productionLocations.id, productionLocations.businessId],
    }),
    check('auth_access_grants_positive_version', sql`${table.version} > 0`),
    check(
      'auth_access_grants_role_valid',
      sql`${table.role} in ('owner', 'manager', 'operator')`,
    ),
    check(
      'auth_access_grants_scope_shape',
      sql`(${table.scopeKind} = 'business' and ${table.scopeId} = ${table.businessId}::text and ${table.scopeResourceType} = '*' and ${table.locationId} is null) or (${table.scopeKind} = 'location' and ${table.scopeId} = ${table.locationId} and ${table.scopeResourceType} = '*' and ${table.locationId} is not null) or (${table.scopeKind} = 'resource' and ${table.scopeResourceType} <> '*' and length(btrim(${table.scopeId})) > 0 and ${table.locationId} is null)`,
    ),
    check(
      'auth_access_grants_role_scope_valid',
      sql`(${table.role} = 'owner' and ${table.scopeKind} = 'business' and ${table.endsAt} is null) or (${table.role} = 'manager' and ${table.scopeKind} in ('business', 'location')) or (${table.role} = 'operator' and ${table.scopeKind} = 'location')`,
    ),
    check(
      'auth_access_grants_window_valid',
      sql`${table.endsAt} is null or ${table.startsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      'auth_access_grants_state_timestamps_valid',
      sql`(${table.state} = 'active' and ${table.revokedAt} is null and ${table.revokedByIdentityId} is null and ${table.revocationReason} is null and ${table.expiredAt} is null) or (${table.state} = 'revoked' and ${table.revokedAt} is not null and ${table.revokedByIdentityId} is not null and length(btrim(${table.revocationReason})) > 0 and ${table.expiredAt} is null) or (${table.state} = 'expired' and ${table.revokedAt} is null and ${table.revokedByIdentityId} is null and ${table.revocationReason} is null and ${table.expiredAt} is not null)`,
    ),
  ],
);

export const authLifecycleTransitions = pgTable(
  'auth_lifecycle_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businessAccounts.id),
    aggregateKind: text('aggregate_kind').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    fromState: text('from_state').notNull(),
    toState: text('to_state').notNull(),
    eventType: text('event_type').notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    commandHash: text('command_hash').notNull(),
    origin: text('origin').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    actorIdentityId: uuid('actor_identity_id').references(
      () => authIdentities.id,
    ),
    reasonCode: text('reason_code').notNull(),
    reasonNote: text('reason_note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_lifecycle_transitions_version_unique').on(
      table.aggregateKind,
      table.aggregateId,
      table.aggregateVersion,
    ),
    uniqueIndex('auth_lifecycle_transitions_idempotency_unique').on(
      table.idempotencyKey,
    ),
    index('auth_lifecycle_transitions_aggregate_idx').on(
      table.aggregateKind,
      table.aggregateId,
      table.occurredAt,
    ),
    check(
      'auth_lifecycle_transitions_positive_version',
      sql`${table.aggregateVersion} > 1`,
    ),
    check(
      'auth_lifecycle_transitions_command_hash_shape',
      sql`${table.commandHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'auth_lifecycle_transitions_actor_valid',
      sql`(${table.actorKind} = 'human' and ${table.actorIdentityId} is not null and ${table.actorId} = ${table.actorIdentityId}::text) or (${table.actorKind} in ('service', 'system') and length(btrim(${table.actorId})) > 0)`,
    ),
    check(
      'auth_lifecycle_transitions_context_present',
      sql`length(btrim(${table.idempotencyKey})) > 0 and length(btrim(${table.origin})) > 0 and length(btrim(${table.reasonCode})) > 0 and (${table.reasonNote} is null or length(btrim(${table.reasonNote})) > 0)`,
    ),
    check(
      'auth_lifecycle_transitions_edge_valid',
      sql`(${table.aggregateKind} = 'invitation' and ${table.fromState} = 'pending' and ((${table.eventType} = 'accept' and ${table.toState} = 'accepted') or (${table.eventType} = 'revoke' and ${table.toState} = 'revoked') or (${table.eventType} = 'expire' and ${table.toState} = 'expired'))) or (${table.aggregateKind} = 'membership' and ((${table.fromState} = 'active' and ${table.eventType} = 'suspend' and ${table.toState} = 'suspended') or (${table.fromState} = 'suspended' and ${table.eventType} = 'reactivate' and ${table.toState} = 'active') or (${table.fromState} in ('active', 'suspended') and ${table.eventType} = 'end' and ${table.toState} = 'ended'))) or (${table.aggregateKind} = 'access_grant' and ${table.fromState} = 'active' and ((${table.eventType} = 'revoke' and ${table.toState} = 'revoked') or (${table.eventType} = 'expire' and ${table.toState} = 'expired')))`,
    ),
  ],
);

export const authCommandReceipts = pgTable(
  'auth_command_receipts',
  {
    idempotencyKey: text('idempotency_key').primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businessAccounts.id),
    aggregateKind: text('aggregate_kind').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    commandHash: text('command_hash').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    actorIdentityId: uuid('actor_identity_id').references(
      () => authIdentities.id,
    ),
    resultMetadata: jsonb('result_metadata_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('auth_command_receipts_aggregate_idx').on(
      table.aggregateKind,
      table.aggregateId,
    ),
    check(
      'auth_command_receipts_command_hash_shape',
      sql`${table.commandHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'auth_command_receipts_actor_valid',
      sql`(${table.actorKind} = 'human' and ${table.actorIdentityId} is not null and ${table.actorId} = ${table.actorIdentityId}::text) or (${table.actorKind} in ('service', 'system') and length(btrim(${table.actorId})) > 0)`,
    ),
    check(
      'auth_command_receipts_result_object',
      sql`jsonb_typeof(${table.resultMetadata}) = 'object'`,
    ),
  ],
);

/**
 * Compatibility-only assignments for pre-Control sessions. New workforce
 * authority is persisted in auth_access_grants and this table must not receive
 * new Control grants after that read path is enabled.
 */
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
