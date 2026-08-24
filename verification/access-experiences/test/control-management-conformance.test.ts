import {
  controlManagementCellDeclarations,
  makeControlExperience as makeTargetControlExperience,
} from '@pressly/experience-control/testing/assembly';
import { resolveControlAccessCellDeclaration } from '@pressly/experience-control/operations/access/resolve-access/cell';
import { describe, expect, it } from 'vitest';

const now = new Date('2026-08-22T20:00:00.000Z');
const businessId = '11111111-1111-4111-8111-111111111111';
const identityId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const membershipId = '44444444-4444-4444-8444-444444444444';
const customerId = '55555555-5555-4555-8555-555555555555';
const orderId = '66666666-6666-4666-8666-666666666666';
const fulfillmentId = '77777777-7777-4777-8777-777777777777';
const invitationId = '88888888-8888-4888-8888-888888888888';
const grantId = '99999999-9999-4999-8999-999999999999';

const context = {
  access: {
    business: { id: businessId, name: 'Pressly Laundry' },
    locations: [{ id: 'east', name: 'East', timezone: 'America/New_York' }],
    selectedLocationId: 'east',
    capabilities: [
      'control:view',
      'team:read',
      'team:write',
      'customers:read',
      'customers:write',
      'orders:read',
      'orders:write',
      'security:read',
      'security:write',
      'processor:view',
    ] as (
      | 'control:view'
      | 'team:read'
      | 'team:write'
      | 'customers:read'
      | 'customers:write'
      | 'orders:read'
      | 'orders:write'
      | 'security:read'
      | 'security:write'
      | 'processor:view'
    )[],
    applications: [
      {
        id: 'control' as const,
        label: 'Pressly Control',
        description: 'Manage people, customers, orders, and account security.',
        href: 'https://control.pressly.test',
      },
    ],
  },
  actor: { identityId, sessionId },
  command: {
    origin: 'pressly_control' as const,
    principal: { kind: 'human' as const, id: identityId },
  },
};

const success = <Value>(value: Value) => ({ kind: 'success' as const, value });
const unavailable = async () =>
  Promise.reject(Object.freeze({ fixture: 'unavailable capability' }));
const capability = Object.freeze({ execute: unavailable });

const target = (input: {
  access?: Readonly<Record<string, unknown>>;
  customers?: Readonly<Record<string, unknown>>;
  orders?: Readonly<Record<string, unknown>>;
}) =>
  makeTargetControlExperience({
    access: {
      login: capability,
      loadSession: capability,
      revokeSession: capability,
      completeMfaChallenge: capability,
      listIdentitySessions: capability,
      revokeIdentitySessions: capability,
      beginMfaEnrollment: capability,
      confirmMfaEnrollment: capability,
      regenerateMfaRecoveryCodes: capability,
      removeMfa: capability,
      listEffectiveAccessGrants: capability,
      listActiveBusinessLocations: capability,
      listWorkforce: capability,
      getWorkforceMember: capability,
      listWorkforceMemberSessions: capability,
      revokeWorkforceMemberSessions: capability,
      listWorkforceInvitations: capability,
      issueWorkforceInvitation: capability,
      reissueWorkforceInvitation: capability,
      revokeWorkforceInvitation: capability,
      transitionWorkforceMembership: capability,
      grantWorkforceAccess: capability,
      revokeWorkforceAccess: capability,
      listWorkforceSecurityEvents: capability,
      previewWorkforceInvitation: capability,
      acceptWorkforceInvitation: capability,
      ...input.access,
    },
    customers: {
      listCustomers: capability,
      getCustomer: capability,
      createCustomer: capability,
      updateCustomer: capability,
      ...input.customers,
    },
    orders: {
      listOrders: capability,
      getOrder: capability,
      createOrder: capability,
      correctOrder: capability,
      ...input.orders,
    },
    presentation: {
      deriveCsrfToken: () => 'a'.repeat(43),
      serializeCookies: () => [],
    },
    controlOrigin: 'https://control.pressly.test',
    processorOrigin: 'https://processor.pressly.test',
  } as never);

const targetValue = async <Value>(
  outcome: Promise<
    | Readonly<{ kind: 'success'; value: Value }>
    | Readonly<{ kind: 'failure'; failure: unknown }>
  >,
): Promise<Value> => {
  const resolved = await outcome;
  expect(resolved.kind).toBe('success');
  if (resolved.kind === 'failure') return resolved.failure as never;
  return resolved.value;
};
const serialized = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value)) as unknown;

describe('public Control Experience target conformance', () => {
  it('pins public resolver output across the two split Access queries', async () => {
    const grants = [
      {
        businessId,
        businessName: 'Pressly Laundry',
        role: 'owner' as const,
        scopeKind: 'location' as const,
        scopeId: 'east',
      },
      {
        businessId,
        businessName: 'Pressly Laundry',
        role: 'operator' as const,
        scopeKind: 'location' as const,
        scopeId: 'west',
      },
    ];
    const locations = [
      { id: 'east', name: 'East', timezone: 'America/New_York' },
      { id: 'west', name: 'West', timezone: 'America/New_York' },
    ];
    const targetExperience = target({
      access: {
        listEffectiveAccessGrants: {
          execute: async () => success({ grants }),
        },
        listActiveBusinessLocations: {
          execute: async () => success({ locations }),
        },
      },
    });
    const targetAccess = await targetValue(
      targetExperience.cells.resolveAccess.execute({
        identityId,
        assuranceLevel: 'mfa',
      }),
    );
    expect(
      resolveControlAccessCellDeclaration.contract.output.encode(targetAccess),
    ).toEqual({
      business: { id: businessId, name: 'Pressly Laundry' },
      locations: [locations[0]],
      selectedLocationId: 'east',
      capabilities: [
        'control:view',
        'team:read',
        'team:write',
        'customers:read',
        'customers:write',
        'orders:read',
        'orders:write',
        'security:read',
        'processor:view',
        'security:write',
      ],
      applications: [
        {
          id: 'control',
          label: 'Pressly Control',
          description:
            'Manage people, customers, orders, and account security.',
          href: 'https://control.pressly.test',
        },
        {
          id: 'processor',
          label: 'Pressly Processor',
          description: 'Run intake, scheduling, and laundry-floor production.',
          href: 'https://processor.pressly.test',
        },
      ],
    });

    const businessScopedExperience = target({
      access: {
        listEffectiveAccessGrants: {
          execute: async () =>
            success({
              grants: [
                {
                  ...grants[0],
                  scopeKind: 'business' as const,
                  scopeId: businessId,
                },
                grants[1],
              ],
            }),
        },
        listActiveBusinessLocations: {
          execute: async () => success({ locations }),
        },
      },
    });
    const businessScopedAccess = await targetValue(
      businessScopedExperience.cells.resolveAccess.execute({
        identityId,
        assuranceLevel: 'mfa',
      }),
    );
    expect(
      resolveControlAccessCellDeclaration.contract.output.encode(
        businessScopedAccess,
      ),
    ).toMatchObject({ locations });
  });

  it('pins all four customer operation projections', async () => {
    const customer = {
      id: customerId,
      businessId,
      version: 2,
      active: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
      businessName: null,
      phone: null,
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      possibleDuplicateCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const customerProjection = {
      id: customer.id,
      version: customer.version,
      active: customer.active,
      firstName: customer.firstName,
      lastName: customer.lastName,
      businessName: customer.businessName,
      phone: customer.phone,
      email: customer.email,
      displayName: customer.displayName,
      possibleDuplicateCount: customer.possibleDuplicateCount,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
    const mutation = { userId: customerId, version: 2, replayed: false };
    const targetExperience = target({
      customers: {
        listCustomers: {
          execute: async () => success({ items: [customer], nextCursor: null }),
        },
        getCustomer: { execute: async () => success(customer) },
        createCustomer: { execute: async () => success(mutation) },
        updateCustomer: { execute: async () => success(mutation) },
      },
    });
    const targetList = await targetValue(
      targetExperience.cells.listCustomers.execute({ context, limit: 50 }),
    );
    expect(
      controlManagementCellDeclarations.listCustomers.contract.output.encode(
        targetList,
      ),
    ).toEqual(serialized({ items: [customerProjection], nextCursor: null }));
    const targetGet = await targetValue(
      targetExperience.cells.getCustomer.execute({
        context,
        userId: customerId,
      }),
    );
    expect(
      controlManagementCellDeclarations.getCustomer.contract.output.encode(
        targetGet,
      ),
    ).toEqual(serialized(customerProjection));
    const customerProfile = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      businessName: null,
      phone: null,
      email: 'ada@example.com',
    };
    expect(
      await targetValue(
        targetExperience.cells.createCustomer.execute({
          context,
          idempotencyKey: 'customer-create-key',
          profile: customerProfile,
        }),
      ),
    ).toEqual(mutation);
    expect(
      await targetValue(
        targetExperience.cells.updateCustomer.execute({
          context,
          userId: customerId,
          idempotencyKey: 'customer-update-key',
          expectedVersion: 1,
          changes: { active: false },
        }),
      ),
    ).toEqual(mutation);
  });

  it('pins all four order operation projections and location scoping', async () => {
    const order = {
      orderId,
      businessId,
      orderVersion: 3,
      fulfillmentId,
      fulfillmentVersion: 2,
      displayNumber: 'A-100',
      state: 'open' as const,
      dueAt: now,
      currency: 'USD',
      totalAmountCents: 2_500,
      balanceDueCents: 500,
      customer: {
        resolution: 'resolved' as const,
        userId: customerId,
        displayName: 'Ada Lovelace',
        phone: null,
        email: 'ada@example.com',
      },
      fulfillment: {
        typeCode: 'wash_fold',
        locationId: 'east',
        releaseState: 'unreleased' as const,
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
      },
      createdAt: now,
      updatedAt: now,
    };
    const detail = { ...order, items: [] };
    const orderProjection = {
      id: orderId,
      version: 3,
      displayNumber: 'A-100',
      state: 'open',
      dueAt: now,
      currency: 'USD',
      totalAmountCents: 2_500,
      balanceDueCents: 500,
      customer: order.customer,
      fulfillment: {
        id: fulfillmentId,
        version: 2,
        ...order.fulfillment,
      },
      createdAt: now,
      updatedAt: now,
    } as const;
    const mutation = { orderId, fulfillmentId, version: 3, replayed: false };
    const targetExperience = target({
      orders: {
        listOrders: {
          execute: async () => success({ items: [order], nextCursor: null }),
        },
        getOrder: { execute: async () => success(detail) },
        createOrder: { execute: async () => success(mutation) },
        correctOrder: { execute: async () => success(mutation) },
      },
    });
    const targetList = await targetValue(
      targetExperience.cells.listOrders.execute({ context, limit: 50 }),
    );
    expect(
      controlManagementCellDeclarations.listOrders.contract.output.encode(
        targetList,
      ),
    ).toEqual(serialized({ items: [orderProjection], nextCursor: null }));
    const targetGet = await targetValue(
      targetExperience.cells.getOrder.execute({ context, orderId }),
    );
    expect(
      controlManagementCellDeclarations.getOrder.contract.output.encode(
        targetGet,
      ),
    ).toEqual(serialized({ ...orderProjection, items: detail.items }));
    const create = {
      context,
      idempotencyKey: 'order-create-key',
      reasonCode: 'new_customer_order' as const,
      reasonNote: null,
      customer: { resolution: 'resolved' as const, userId: customerId },
      displayNumber: null,
      dueAt: now,
      currency: 'USD',
      totalAmountCents: 100,
      balanceDueCents: null,
      items: [],
      fulfillment: {
        typeCode: 'wash_fold',
        locationId: 'east',
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
      },
    };
    expect(
      await targetValue(targetExperience.cells.createOrder.execute(create)),
    ).toEqual(mutation);
    const correction = {
      context,
      orderId,
      idempotencyKey: 'order-correct-key',
      reasonCode: 'manager_correction' as const,
      reasonNote: null,
      expectedOrderVersion: 3,
      expectedFulfillmentVersion: 2,
      changes: { dueAt: now },
    };
    expect(
      await targetValue(
        targetExperience.cells.correctOrder.execute(correction),
      ),
    ).toEqual(mutation);
  });

  it('pins the seven workforce, six invitation and security projections', async () => {
    const grant = {
      id: grantId,
      businessId,
      membershipId,
      identityId,
      role: 'owner' as const,
      scope: { kind: 'business' as const, id: businessId },
      state: 'active' as const,
      version: 1,
      startsAt: now,
      endsAt: null,
      effective: true,
    };
    const member = {
      membershipId,
      businessId,
      identityId,
      displayName: 'Owner',
      email: 'owner@example.com',
      state: 'active' as const,
      version: 1,
      mfaEnabled: true,
      grants: [grant],
      startedAt: now,
      suspendedAt: null,
      endedAt: null,
    };
    const detail = {
      ...member,
      activeSessionCount: 1,
      createdAt: now,
      updatedAt: now,
    };
    const invitation = {
      id: invitationId,
      businessId,
      emailNormalized: 'invitee@example.com',
      displayName: 'Invitee',
      intendedRole: 'manager' as const,
      intendedLocationId: null,
      state: 'pending' as const,
      version: 1,
      expiresAt: now,
      createdAt: now,
    };
    const invitationProjection = {
      id: invitationId,
      businessId,
      email: 'invitee@example.com',
      displayName: 'Invitee',
      intendedRole: 'manager',
      intendedLocationId: null,
      state: 'pending',
      version: 1,
      expiresAt: now,
      createdAt: now,
    } as const;
    const preview = {
      invitationId,
      businessId,
      businessName: 'Pressly Laundry',
      emailNormalized: 'invitee@example.com',
      displayName: 'Invitee',
      intendedRole: 'manager' as const,
      intendedLocationId: null,
      expiresAt: now,
      existingIdentity: true,
    };
    const accepted = {
      invitation,
      membershipId,
      identityId,
      identityCreated: false,
      privilegedAccessEffective: true,
      replayed: false,
    };
    const acceptanceProjection = {
      invitationId,
      membershipId,
      identityId,
      identityCreated: false,
      privilegedAccessEffective: true,
      replayed: false,
    };
    const previewProjection = {
      invitationId,
      business: { id: businessId, name: 'Pressly Laundry' },
      email: 'invitee@example.com',
      displayName: 'Invitee',
      intendedRole: 'manager',
      intendedLocationId: null,
      expiresAt: now,
      existingIdentity: true,
    } as const;
    const sessions = {
      sessions: [
        {
          id: sessionId,
          issuedAt: now.toISOString(),
          lastUsedAt: now.toISOString(),
          expiresAt: now.toISOString(),
          revokedAt: null,
          current: true,
        },
      ],
    };
    const revocation = { revokedCount: 1, replayed: false };
    const transition = { member: detail, revokedSessionCount: 1 };
    const grantRevocation = { grant, revokedSessionCount: 1 };
    const security = {
      events: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          eventType: 'workforce.access_granted',
          resourceType: 'access_grant',
          actorDisplayName: 'Owner',
          createdAt: now.toISOString(),
        },
      ],
      nextCursor: null,
    };
    const targetExperience = target({
      access: {
        listWorkforce: {
          execute: async () => success({ members: [detail], nextCursor: null }),
        },
        getWorkforceMember: { execute: async () => success(detail) },
        listWorkforceMemberSessions: {
          execute: async () => success(sessions),
        },
        revokeWorkforceMemberSessions: {
          execute: async () => success(revocation),
        },
        transitionWorkforceMembership: {
          execute: async () => success(transition),
        },
        grantWorkforceAccess: { execute: async () => success(grant) },
        revokeWorkforceAccess: {
          execute: async () => success(grantRevocation),
        },
        listWorkforceInvitations: {
          execute: async () =>
            success({ invitations: [invitation], nextCursor: null }),
        },
        issueWorkforceInvitation: {
          execute: async () =>
            success({ status: 'issued', invitation, token: 't'.repeat(40) }),
        },
        reissueWorkforceInvitation: {
          execute: async () => success({ status: 'replayed', invitation }),
        },
        revokeWorkforceInvitation: {
          execute: async () => success(invitation),
        },
        previewWorkforceInvitation: {
          execute: async () => success(preview),
        },
        acceptWorkforceInvitation: {
          execute: async () => success(accepted),
        },
        listWorkforceSecurityEvents: {
          execute: async () => success(security),
        },
      },
    });
    const pairs = [
      [
        'listMembers',
        targetExperience.cells.listMembers.execute({ context, limit: 50 }),
        { members: [member], nextCursor: null },
      ],
      [
        'getMember',
        targetExperience.cells.getMember.execute({ context, membershipId }),
        detail,
      ],
      [
        'listMemberSessions',
        targetExperience.cells.listMemberSessions.execute({
          context,
          membershipId,
        }),
        sessions,
      ],
      [
        'revokeMemberSessions',
        targetExperience.cells.revokeMemberSessions.execute({
          context,
          membershipId,
          idempotencyKey: 'revoke-sessions-key',
        }),
        revocation,
      ],
      [
        'suspendMembership',
        targetExperience.cells.suspendMembership.execute({
          context,
          membershipId,
          expectedVersion: 1,
          idempotencyKey: 'transition-key',
        }),
        transition,
      ],
      [
        'grantAccess',
        targetExperience.cells.grantAccess.execute({
          context,
          membershipId,
          identityId,
          role: 'owner',
          scope: { kind: 'business', id: businessId },
          idempotencyKey: 'grant-access-key',
        }),
        grant,
      ],
      [
        'revokeAccess',
        targetExperience.cells.revokeAccess.execute({
          context,
          grantId,
          expectedVersion: 1,
          idempotencyKey: 'revoke-access-key',
        }),
        grantRevocation,
      ],
      [
        'listInvitations',
        targetExperience.cells.listInvitations.execute({
          context,
          includeTerminal: false,
          limit: 50,
        }),
        { invitations: [invitationProjection], nextCursor: null },
      ],
      [
        'issueInvitation',
        targetExperience.cells.issueInvitation.execute({
          context,
          email: 'invitee@example.com',
          displayName: 'Invitee',
          intendedRole: 'manager',
          intendedLocationId: null,
          idempotencyKey: 'issue-invite-key',
        }),
        {
          status: 'issued',
          invitation: invitationProjection,
          acceptanceToken: 't'.repeat(40),
        },
      ],
      [
        'reissueInvitation',
        targetExperience.cells.reissueInvitation.execute({
          context,
          invitationId,
          expectedVersion: 1,
          idempotencyKey: 'reissue-invite-key',
        }),
        { status: 'replayed', invitation: invitationProjection },
      ],
      [
        'revokeInvitation',
        targetExperience.cells.revokeInvitation.execute({
          context,
          invitationId,
          expectedVersion: 1,
          idempotencyKey: 'revoke-invite-key',
        }),
        invitationProjection,
      ],
      [
        'previewInvitation',
        targetExperience.cells.previewInvitation.execute({
          acceptanceToken: 't'.repeat(40),
        }),
        previewProjection,
      ],
      [
        'acceptNewInvitation',
        targetExperience.cells.acceptNewInvitation.execute({
          identityMode: 'new_identity',
          acceptanceToken: 't'.repeat(40),
          idempotencyKey: 'accept-invite-key',
          password: 'correct-horse-battery-staple',
        }),
        acceptanceProjection,
      ],
      [
        'listSecurityEvents',
        targetExperience.cells.listSecurityEvents.execute({
          context,
          limit: 50,
        }),
        security,
      ],
    ] as const;

    for (const [name, targetOutcome, expected] of pairs) {
      const targetProjection = await targetValue(
        targetOutcome as Promise<
          | Readonly<{ kind: 'success'; value: unknown }>
          | Readonly<{ kind: 'failure'; failure: unknown }>
        >,
      );
      const declaration = controlManagementCellDeclarations[name];
      expect(
        declaration.contract.output.encode(targetProjection as never),
      ).toEqual(serialized(expected));
    }
  });
});
