import { describe, expect, it } from 'vitest';
import {
  controlAuthenticatedSessionSchema,
  controlExistingInvitationMfaRequestSchema,
  controlGrantAccessRequestSchema,
  controlGrantParamsSchema,
  controlIssueInvitationResultSchema,
  controlInvitationBootstrapResultSchema,
  controlInvitationListQuerySchema,
  controlInvitationParamsSchema,
  controlMembershipParamsSchema,
  controlSecurityEventListSchema,
  controlWorkforceInvitationPageSchema,
  controlWorkforceMemberDetailProjectionSchema,
  controlWorkforceMemberPageSchema,
  presslyApplicationSchema,
} from '../src/auth/control.contracts.ts';

const grant = {
  id: '00000000-0000-4000-8000-000000000010',
  businessId: '00000000-0000-4000-8000-000000000100',
  membershipId: '00000000-0000-4000-8000-000000000020',
  identityId: '00000000-0000-4000-8000-000000000001',
  role: 'operator' as const,
  scope: { kind: 'location' as const, id: 'laundry-1' },
  state: 'active' as const,
  version: 1,
  startsAt: null,
  endsAt: null,
  effective: true,
};

const member = {
  membershipId: grant.membershipId,
  businessId: grant.businessId,
  identityId: grant.identityId,
  displayName: 'Operator One',
  email: 'operator@example.com',
  state: 'active' as const,
  version: 1,
  mfaEnabled: true,
  grants: [grant],
  startedAt: '2026-07-30T20:00:00.000Z',
  suspendedAt: null,
  endedAt: null,
};

const invitation = {
  id: '00000000-0000-4000-8000-000000000030',
  businessId: grant.businessId,
  email: 'invitee@example.com',
  displayName: 'Invitee One',
  intendedRole: 'operator' as const,
  intendedLocationId: 'laundry-1',
  state: 'pending' as const,
  version: 1,
  expiresAt: '2026-08-01T20:00:00.000Z',
  createdAt: '2026-07-30T20:00:00.000Z',
};

describe('Control contracts', () => {
  it('accepts a capability manifest without exposing role arithmetic', () => {
    const parsed = controlAuthenticatedSessionSchema.parse({
      status: 'authenticated',
      principal: {
        identityId: '00000000-0000-4000-8000-000000000001',
        displayName: 'Manager One',
        email: 'manager@example.com',
      },
      access: {
        business: {
          id: '00000000-0000-4000-8000-000000000100',
          name: 'Pressly One',
        },
        locations: [
          {
            id: 'laundry-1',
            name: 'Laundry Production',
            timezone: 'America/New_York',
          },
        ],
        selectedLocationId: 'laundry-1',
        capabilities: ['control:view', 'team:read'],
        applications: [
          {
            id: 'control',
            label: 'Pressly Control',
            description: 'Manage the business.',
            href: 'https://control.trypressly.com',
          },
        ],
      },
      expiresAt: '2026-08-01T20:00:00.000Z',
      csrfToken: 'A'.repeat(43),
    });

    expect(parsed.access.capabilities).toEqual(['control:view', 'team:read']);
    expect(parsed.principal).not.toHaveProperty('roles');
  });

  it('accepts only origin-level HTTP(S) application destinations', () => {
    const session = {
      status: 'authenticated',
      principal: {
        identityId: '00000000-0000-4000-8000-000000000001',
        displayName: 'Manager One',
      },
      access: {
        business: {
          id: '00000000-0000-4000-8000-000000000100',
          name: 'Pressly One',
        },
        locations: [],
        selectedLocationId: null,
        capabilities: ['control:view'],
        applications: [
          {
            id: 'processor',
            label: 'Pressly Processor',
            description: 'Run floor work.',
            href: 'javascript:alert(1)',
          },
        ],
      },
      expiresAt: '2026-08-01T20:00:00.000Z',
      csrfToken: 'A'.repeat(43),
    };

    expect(controlAuthenticatedSessionSchema.safeParse(session).success).toBe(
      false,
    );
    expect(
      controlAuthenticatedSessionSchema.safeParse({
        ...session,
        access: {
          ...session.access,
          applications: [
            {
              ...session.access.applications[0],
              href: 'https://processor.trypressly.com/orders',
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('normalizes invitation query defaults and rejects unknown fields', () => {
    expect(controlInvitationListQuerySchema.parse({})).toEqual({
      includeTerminal: false,
      limit: 50,
    });
    expect(() =>
      controlInvitationListQuerySchema.parse({ includeSecrets: 'true' }),
    ).toThrow();
  });

  it('validates bounded access grants and their scope shape', () => {
    expect(
      controlGrantAccessRequestSchema.parse({
        idempotencyKey: 'grant-access-001',
        identityId: '00000000-0000-4000-8000-000000000001',
        role: 'operator',
        scope: { kind: 'location', id: 'laundry-1' },
      }).scope,
    ).toEqual({ kind: 'location', id: 'laundry-1' });
  });

  it.each([
    {
      label: 'membership',
      schema: controlMembershipParamsSchema,
      key: 'membershipId',
    },
    {
      label: 'invitation',
      schema: controlInvitationParamsSchema,
      key: 'invitationId',
    },
    { label: 'grant', schema: controlGrantParamsSchema, key: 'grantId' },
  ] as const)(
    'requires a UUID for the $label route contract',
    ({ schema, key }) => {
      expect(schema.safeParse({ [key]: 'not-a-uuid' }).success).toBe(false);
    },
  );

  it('keeps invitation MFA proof bounded and supports a non-Control destination', () => {
    expect(
      controlExistingInvitationMfaRequestSchema.parse({
        acceptanceToken: 'a'.repeat(32),
        idempotencyKey: 'accept-existing-001',
        method: 'totp',
        code: '123456',
      }),
    ).toMatchObject({ method: 'totp', code: '123456' });

    expect(
      controlInvitationBootstrapResultSchema.parse({
        status: 'accepted',
        acceptance: {
          invitationId: '00000000-0000-4000-8000-000000000001',
          membershipId: '00000000-0000-4000-8000-000000000002',
          identityId: '00000000-0000-4000-8000-000000000003',
          identityCreated: false,
          privilegedAccessEffective: true,
          replayed: false,
        },
        session: null,
        destination: {
          id: 'processor',
          label: 'Pressly Processor',
          description: 'Run floor work.',
          href: 'https://processor.trypressly.com',
        },
      }),
    ).toMatchObject({
      status: 'accepted',
      session: null,
      destination: { id: 'processor' },
    });
  });

  it('owns bounded Control workforce projections without changing their wire shape', () => {
    expect(
      controlWorkforceMemberDetailProjectionSchema.parse({
        ...member,
        activeSessionCount: 2,
        createdAt: '2026-07-30T20:00:00.000Z',
        updatedAt: '2026-07-31T20:00:00.000Z',
      }),
    ).toMatchObject({
      membershipId: member.membershipId,
      grants: [{ scope: { kind: 'location', id: 'laundry-1' } }],
    });
    expect(
      controlWorkforceMemberPageSchema.safeParse({
        members: Array.from({ length: 101 }, () => member),
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      controlWorkforceInvitationPageSchema.safeParse({
        invitations: [invitation],
        nextCursor: 'c'.repeat(1_001),
      }).success,
    ).toBe(false);
    expect(
      controlIssueInvitationResultSchema.safeParse({
        status: 'issued',
        invitation,
        acceptanceToken: 't'.repeat(513),
      }).success,
    ).toBe(false);
  });

  it('bounds Control sessions, capabilities, and app destinations', () => {
    const session = {
      status: 'authenticated',
      principal: {
        identityId: grant.identityId,
        displayName: member.displayName,
      },
      access: {
        business: { id: grant.businessId, name: 'Pressly One' },
        locations: [],
        selectedLocationId: null,
        capabilities: ['control:view'],
        applications: [],
      },
      expiresAt: '2026-08-01T20:00:00.000Z',
      csrfToken: 'A'.repeat(43),
    };

    expect(
      controlAuthenticatedSessionSchema.safeParse({
        ...session,
        access: {
          ...session.access,
          locations: Array.from({ length: 101 }, (_, index) => ({
            id: `laundry-${index}`,
            name: `Laundry ${index}`,
            timezone: 'America/New_York',
          })),
        },
      }).success,
    ).toBe(false);
    expect(
      controlAuthenticatedSessionSchema.safeParse({
        ...session,
        access: {
          ...session.access,
          capabilities: ['control:view', 'control:view'],
        },
      }).success,
    ).toBe(false);
    expect(
      presslyApplicationSchema.safeParse({
        id: 'control',
        label: 'Pressly Control',
        description: 'Manage the business.',
        href: `https://${'a'.repeat(290)}.example.com`,
      }).success,
    ).toBe(false);
  });

  it('bounds security event pages and cursors', () => {
    const event = {
      id: '00000000-0000-4000-8000-000000000040',
      eventType: 'auth.session.revoked',
      resourceType: 'auth_session',
      actorDisplayName: 'Owner One',
      createdAt: '2026-07-31T20:00:00.000Z',
    };

    expect(
      controlSecurityEventListSchema.safeParse({
        events: Array.from({ length: 101 }, () => event),
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      controlSecurityEventListSchema.safeParse({
        events: [event],
        nextCursor: 'c'.repeat(1_001),
      }).success,
    ).toBe(false);
  });
});
