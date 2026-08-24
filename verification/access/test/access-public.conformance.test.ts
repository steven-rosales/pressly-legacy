import { createHash } from 'node:crypto';
import { accessCellDeclarations } from '@pressly/access-system/contracts/access-operations-v2';
import { makeAccessAuthorization } from '@pressly/access-system/testing/authorization';
import { makeAccessSystem } from '@pressly/access-system/testing/assembly';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  authorize,
  businessScope,
  globalScope,
  locationScope,
  type Action,
  type AuthResource,
  type PolicyRule,
  type PrincipalAttributes,
  type Role,
  type Scope,
} from '@pressly/access-system/authorization';
import type { Principal } from '@pressly/access-system/authentication';
import { describe, expect, it } from 'vitest';
import { observePolicyContracts } from '../src/public.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const clock = { now: () => now };
const fakeDatabase = {} as PostgresDatabase;
const policyOptions = {
  pricing: { freshSessionMaxAgeMinutes: 15 },
  authSessions: { freshSessionMaxAgeMinutes: 15 },
  mfa: { freshSessionMaxAgeMinutes: 15 },
} as const;
const locationAncestry = {
  resolveBusinessId: async (locationId: string) =>
    locationId === 'east' ? 'laundry' : 'other',
  listLocationIdsForBusinesses: async (businessIds: readonly string[]) =>
    businessIds.includes('laundry') ? ['west', 'east', 'east'] : [],
};

const principal: Principal = {
  identityId: 'identity-1',
  kind: 'human',
  displayName: 'Access verifier',
  sessionIssuedAt: new Date('2026-08-22T15:55:00.000Z'),
};

const authorization = () =>
  makeAccessAuthorization({
    locationAncestry,
    clock,
    policies: policyOptions,
  });

type DecisionContext = Readonly<{
  role: Role;
  scope: Scope;
  assuranceLevel: 'password' | 'mfa';
  identityActive: boolean;
  sessionAgeMinutes: number;
}>;

const activeAssignment = (role: Role, scope: Scope) => ({
  role,
  scope,
  state: 'active' as const,
  version: 1,
});

const decide = <Resource extends AuthResource>(input: {
  policies: readonly PolicyRule<Resource>[];
  resource: Resource;
  action: Action;
  context: DecisionContext;
}) =>
  authorize({
    principal,
    principalAttributes: {
      assignments: [activeAssignment(input.context.role, input.context.scope)],
      identityActive: input.context.identityActive,
      assuranceLevel: input.context.assuranceLevel,
    },
    action: input.action,
    resource: input.resource,
    environment: {
      now,
      sessionAgeMinutes: input.context.sessionAgeMinutes,
    },
    policies: input.policies,
  });

const policySignature = <Resource extends AuthResource>(
  policies: readonly PolicyRule<Resource>[],
): readonly Readonly<{
  id: string;
  action: Action;
  conditions: readonly string[];
}>[] =>
  observePolicyContracts(policies).map((policy) => ({
    id: policy.id,
    action: policy.action as Action,
    conditions: policy.conditions.map((condition) => condition.name),
  }));

const decisionCase = <Resource extends AuthResource>(
  action: Action,
  policies: readonly PolicyRule<Resource>[],
  resource: Resource,
) => ({
  action,
  decide: (context: DecisionContext) =>
    decide({ action, policies, resource, context }),
});

const invalidWorkforce = (
  code: string,
  field: string,
): Readonly<{ kind: 'failure'; failure: unknown }> => ({
  kind: 'failure',
  failure: {
    kind: 'validation',
    code,
    message: 'Review the highlighted workforce information.',
    details: { field },
  },
});

describe('Access public target conformance', () => {
  it('derives exactly 31 unique versioned operations from real declarations', () => {
    expect(accessCellDeclarations).toHaveLength(31);
    expect(new Set(accessCellDeclarations.map(({ id }) => id))).toHaveLength(
      31,
    );
    for (const declaration of accessCellDeclarations) {
      expect(declaration.contract.input.version).toBe(1);
      expect(declaration.contract.output.version).toBe(1);
      expect(declaration.contract.failure.version).toBe(1);
      expect(declaration.surfaces).toHaveLength(
        declaration.id === 'access.bootstrap-owner.v2' ? 1 : 0,
      );
      if (declaration.id === 'access.bootstrap-owner.v2')
        expect(declaration.surfaces[0]?.kind).toBe('cli');
    }
  });

  it('pins all five policy families and 1,728 authorization outcomes', () => {
    const target = authorization();
    const signatures = {
      pricing: policySignature(target.policies.pricing),
      authSessions: policySignature(target.policies.authSessions),
      mfa: policySignature(target.policies.mfa),
      orderManagement: policySignature(target.policies.orderManagement),
      production: policySignature(target.policies.production),
    };
    expect(signatures).toEqual({
      pricing: [
        {
          id: 'pricing.plan.active_owner',
          action: 'pricing:plan',
          conditions: ['has_active_role', 'has_assurance_level'],
        },
        {
          id: 'pricing.publish.active_owner.fresh_session',
          action: 'pricing:publish',
          conditions: [
            'has_active_role',
            'has_assurance_level',
            'fresh_session',
          ],
        },
      ],
      authSessions: [
        {
          id: 'auth.sessions.read.active_owner',
          action: 'auth:session:read',
          conditions: ['has_active_role', 'has_assurance_level'],
        },
        {
          id: 'auth.sessions.read.active_self',
          action: 'auth:session:read',
          conditions: ['same_identity'],
        },
        {
          id: 'auth.sessions.revoke.active_owner.fresh_session',
          action: 'auth:session:revoke',
          conditions: [
            'has_active_role',
            'has_assurance_level',
            'fresh_session',
          ],
        },
        {
          id: 'auth.sessions.revoke.active_self',
          action: 'auth:session:revoke',
          conditions: ['same_identity'],
        },
      ],
      mfa: [
        {
          id: 'auth.mfa.enroll.active_self.fresh_password_or_mfa',
          action: 'auth:mfa:enroll',
          conditions: ['same_identity', 'has_assurance_level', 'fresh_session'],
        },
        {
          id: 'auth.mfa.manage.active_self.fresh_mfa',
          action: 'auth:mfa:manage',
          conditions: ['same_identity', 'has_assurance_level', 'fresh_session'],
        },
      ],
      orderManagement: [
        {
          id: 'order-management:order:write.owner_manager_in_scope',
          action: 'order-management:order:write',
          conditions: ['has_scope_role'],
        },
      ],
      production: [
        ...['read', 'priority', 'intake', 'admission', 'stage', 'queue'].map(
          (name) => ({
            id: `production:${name}.owner_manager_operator_in_scope`,
            action: `production:${name}`,
            conditions: ['has_scope_role'],
          }),
        ),
        ...['schedule', 'accept', 'start', 'override'].map((name) => ({
          id: `production:${name}.owner_manager_in_scope`,
          action: `production:${name}`,
          conditions: ['has_scope_role'],
        })),
        {
          id: 'production:resources.active_owner_manager',
          action: 'production:resources',
          conditions: ['has_active_role'],
        },
      ],
    });

    const observations = [
      ...observePolicyContracts(target.policies.pricing),
      ...observePolicyContracts(target.policies.authSessions),
      ...observePolicyContracts(target.policies.mfa),
      ...observePolicyContracts(target.policies.orderManagement),
      ...observePolicyContracts(target.policies.production),
    ].flatMap((policy) => policy.conditions);
    const conditionContracts = {
      has_scope_role: {
        denyReason: 'missing_assignment',
        safeMessage: 'You do not have permission to perform this action.',
      },
      has_active_role: {
        denyReason: 'missing_assignment',
        safeMessage: 'You do not have permission to perform this action.',
      },
      same_identity: {
        denyReason: 'missing_assignment',
        safeMessage: 'You do not have permission to perform this action.',
      },
      has_assurance_level: {
        denyReason: 'insufficient_assurance',
        safeMessage: 'Multi-factor authentication is required for this action.',
      },
      fresh_session: {
        denyReason: 'stale_session',
        safeMessage: 'Please login again before performing this action.',
      },
    } as const;
    for (const condition of observations)
      expect(condition).toEqual({
        name: condition.name,
        ...conditionContracts[
          condition.name as keyof typeof conditionContracts
        ],
      });

    const cases = [
      decisionCase(
        'pricing:plan',
        target.policies.pricing,
        target.resources.pricingCatalog({
          serviceSlug: 'wash-fold',
        }),
      ),
      decisionCase(
        'pricing:publish',
        target.policies.pricing,
        target.resources.pricingCatalog({
          serviceSlug: 'wash-fold',
        }),
      ),
      ...(['read', 'revoke'] as const).map((name) =>
        decisionCase(
          `auth:session:${name}` as Action,
          target.policies.authSessions,
          target.resources.authIdentity(principal.identityId),
        ),
      ),
      ...(['enroll', 'manage'] as const).map((name) =>
        decisionCase(
          `auth:mfa:${name}` as Action,
          target.policies.mfa,
          target.resources.authIdentity(principal.identityId),
        ),
      ),
      decisionCase(
        'order-management:order:write',
        target.policies.orderManagement,
        target.resources.orderManagementLocation('east', 'laundry'),
      ),
      ...[
        'read',
        'priority',
        'intake',
        'admission',
        'stage',
        'queue',
        'schedule',
        'accept',
        'start',
        'override',
      ].map((name) =>
        decisionCase(
          `production:${name}` as Action,
          target.policies.production,
          target.resources.productionLocation('east', 'laundry'),
        ),
      ),
      decisionCase(
        'production:resources',
        target.policies.production,
        target.resources.productionOperations(),
      ),
    ];
    const roles: readonly Role[] = ['owner', 'manager', 'operator'];
    const scopes: readonly Scope[] = [
      globalScope(),
      businessScope('laundry'),
      locationScope('east'),
      locationScope('elsewhere'),
    ];
    const matrix: unknown[] = [];
    const histogram: Record<string, number> = {};
    for (const [caseIndex, entry] of cases.entries())
      for (const role of roles)
        for (const scope of scopes)
          for (const assuranceLevel of ['password', 'mfa'] as const)
            for (const identityActive of [true, false])
              for (const sessionAgeMinutes of [5, 16]) {
                const context = {
                  role,
                  scope,
                  assuranceLevel,
                  identityActive,
                  sessionAgeMinutes,
                };
                const decision = entry.decide(context);
                matrix.push({
                  caseIndex,
                  action: entry.action,
                  role,
                  scope: `${scope.kind}:${scope.id ?? ''}`,
                  assuranceLevel,
                  identityActive,
                  sessionAgeMinutes,
                  decision,
                });
                const key =
                  decision.tag === 'allowed'
                    ? 'allowed'
                    : `denied:${decision.reason}`;
                histogram[key] = (histogram[key] ?? 0) + 1;
              }
    expect(matrix).toHaveLength(1_728);
    expect(histogram).toEqual({
      'denied:insufficient_assurance': 40,
      'denied:inactive_identity': 864,
      allowed: 512,
      'denied:missing_assignment': 272,
      'denied:stale_session': 40,
    });
    expect(
      createHash('sha256').update(JSON.stringify(matrix)).digest('hex'),
    ).toBe('6a4f4a9c450daeba2ff90a0463e4f0813c5cf64d92721ce7f92a121a3d2096e0');
  });

  it('pins scope-query results and capability projections', async () => {
    const target = authorization();
    await expect(target.resolveLocationAncestry('east')).resolves.toEqual({
      locationId: 'east',
      businessId: 'laundry',
    });

    const postures: readonly Readonly<{
      principalAttributes: PrincipalAttributes;
      visibility: null | readonly string[];
      capabilities: readonly string[];
    }>[] = [
      {
        principalAttributes: {
          assignments: [activeAssignment('owner', globalScope())],
          identityActive: true,
          assuranceLevel: 'mfa',
        },
        visibility: [],
        capabilities: [
          'production:read',
          'production:priority',
          'production:intake',
          'production:admission',
          'production:stage',
          'production:queue',
          'production:schedule',
          'production:accept',
          'production:start',
          'production:override',
        ],
      },
      {
        principalAttributes: {
          assignments: [
            activeAssignment('manager', businessScope('laundry')),
            activeAssignment('operator', locationScope('north')),
          ],
          identityActive: true,
          assuranceLevel: 'password',
        },
        visibility: ['east', 'north', 'west'],
        capabilities: [
          'production:read',
          'production:priority',
          'production:intake',
          'production:admission',
          'production:stage',
          'production:queue',
          'production:schedule',
          'production:accept',
          'production:start',
          'production:override',
        ],
      },
      {
        principalAttributes: { assignments: [], identityActive: true },
        visibility: [],
        capabilities: [],
      },
    ];

    for (const posture of postures) {
      await expect(
        target.resolveProductionVisibility({
          principalAttributes: posture.principalAttributes,
        }),
      ).resolves.toEqual(posture.visibility);
      expect(
        target.productionCapabilitiesForLocation({
          principal,
          principalAttributes: posture.principalAttributes,
          locationId: 'east',
          businessId: 'laundry',
          now,
        }),
      ).toEqual(posture.capabilities);
    }
  });

  it('pins 17 bootstrap and workforce validation outcomes without state access', async () => {
    const target = makeAccessSystem({
      db: fakeDatabase,
      schema: presslyPostgresOwnerSchemas.access,
      clock,
      tokenSecret: 'access-verification-token-secret',
      sessionTtlMinutes: 30,
      sessionIdleTimeoutMinutes: 30,
      loginWindowMinutes: 15,
      loginMaxFailures: 5,
      mfaChallengeTtlMinutes: 5,
      mfaChallengeMaxAttempts: 8,
      mfaEncryptionKey: Buffer.alloc(32).toString('base64'),
      mfaIssuer: 'Pressly Access Verification',
      policies: policyOptions,
    });
    const actor = { identityId: '', sessionId: '' };
    const cases = [
      {
        execute: () =>
          target.cells.bootstrapOwner.execute({
            businessId: '',
            businessSlug: 'pressly-one',
            businessDisplayName: 'Pressly One',
            email: '',
            password: '',
            confirmation: '',
          }),
        expected: {
          kind: 'failure',
          failure: {
            kind: 'validation',
            code: 'missing_bootstrap_owner_email',
            message: 'Owner email is required.',
          },
        },
      },
      {
        execute: () =>
          target.cells.issueWorkforceInvitation.execute({
            actor,
            businessId: '',
            email: '',
            displayName: '',
            intendedRole: 'operator',
            intendedLocationId: null,
            idempotencyKey: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      },
      {
        execute: () => target.cells.previewWorkforceInvitation.execute(''),
        expected: invalidWorkforce(
          'invalid_workforce_invitation_token',
          'invitation_token',
        ),
      },
      {
        execute: () =>
          target.cells.acceptWorkforceInvitation.execute({
            rawToken: '',
            idempotencyKey: '',
            acceptance: { kind: 'new_identity', password: '' },
          }),
        expected: invalidWorkforce(
          'invalid_workforce_invitation_token',
          'invitation_token',
        ),
      },
      ...(['reissue', 'revoke'] as const).map((operation) => ({
        execute: () =>
          target.cells[
            operation === 'reissue'
              ? 'reissueWorkforceInvitation'
              : 'revokeWorkforceInvitation'
          ].execute({
            actor,
            invitationId: '',
            businessId: '',
            expectedVersion: 0,
            idempotencyKey: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_invitation_id',
          'invitation_id',
        ),
      })),
      {
        execute: () =>
          target.cells.listWorkforceInvitations.execute({
            actor,
            businessId: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      },
      {
        execute: () =>
          target.cells.listWorkforce.execute({ actor, businessId: '' }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      },
      {
        execute: () =>
          target.cells.getWorkforceMember.execute({
            actor,
            businessId: '',
            membershipId: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      },
      {
        execute: () =>
          target.cells.grantWorkforceAccess.execute({
            actor,
            businessId: '',
            membershipId: '',
            identityId: '',
            role: 'operator',
            scope: { kind: 'location', id: '' },
            idempotencyKey: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      },
      {
        execute: () =>
          target.cells.revokeWorkforceAccess.execute({
            actor,
            businessId: '',
            grantId: '',
            expectedVersion: 0,
            idempotencyKey: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      },
      {
        execute: () =>
          target.cells.listWorkforceMemberSessions.execute({
            actor,
            businessId: '',
            membershipId: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      },
      {
        execute: () =>
          target.cells.revokeWorkforceMemberSessions.execute({
            actor,
            businessId: '',
            membershipId: '',
            idempotencyKey: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      },
      {
        execute: () =>
          target.cells.listWorkforceSecurityEvents.execute({
            actor,
            businessId: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      },
      ...(['suspend', 'reactivate', 'end'] as const).map((event) => ({
        execute: () =>
          target.cells.transitionWorkforceMembership.execute({
            actor,
            businessId: '',
            membershipId: '',
            expectedVersion: 0,
            event,
            idempotencyKey: '',
          }),
        expected: invalidWorkforce(
          'invalid_workforce_business_id',
          'business_id',
        ),
      })),
    ];

    expect(cases).toHaveLength(17);
    for (const entry of cases)
      await expect(entry.execute()).resolves.toEqual(entry.expected);
  });
});
