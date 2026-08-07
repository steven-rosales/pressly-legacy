import { describe, expect, it } from 'vitest';
import {
  acceptWorkforceInvitationRequestSchema,
  issueWorkforceInvitationRequestSchema,
  issueWorkforceInvitationResultSchema,
} from '../src/auth/index.ts';

const invitation = {
  id: '10000000-0000-4000-8000-000000000001',
  businessId: '10000000-0000-4000-8000-000000000002',
  email: 'operator@pressly.test',
  displayName: 'Operator One',
  intendedRole: 'operator' as const,
  intendedLocationId: 'pressly-one',
  state: 'pending' as const,
  version: 1,
  expiresAt: '2026-08-01T20:00:00.000Z',
  acceptedAt: null,
  revokedAt: null,
  expiredAt: null,
  createdAt: '2026-07-29T20:00:00.000Z',
};

describe('workforce contracts', () => {
  it('requires a location when inviting an operator', () => {
    expect(
      issueWorkforceInvitationRequestSchema.safeParse({
        idempotencyKey: 'invite-operator-1',
        email: 'operator@pressly.test',
        displayName: 'Operator One',
        intendedRole: 'operator',
        intendedLocationId: null,
      }).success,
    ).toBe(false);
  });

  it('returns the raw invitation token only on first issue', () => {
    expect(
      issueWorkforceInvitationResultSchema.safeParse({
        status: 'issued',
        invitation,
        acceptanceToken: 'a'.repeat(43),
        replayed: false,
      }).success,
    ).toBe(true);
    expect(
      issueWorkforceInvitationResultSchema.safeParse({
        status: 'replayed',
        invitation,
        replayed: true,
      }).success,
    ).toBe(true);
    expect(
      issueWorkforceInvitationResultSchema.safeParse({
        status: 'replayed',
        invitation,
        acceptanceToken: 'a'.repeat(43),
        replayed: true,
      }).success,
    ).toBe(false);
  });

  it('separates existing identity acceptance from new password setup', () => {
    expect(
      acceptWorkforceInvitationRequestSchema.safeParse({
        identityMode: 'existing_identity',
        idempotencyKey: 'accept-invite-1',
        acceptanceToken: 'a'.repeat(43),
      }).success,
    ).toBe(true);
    expect(
      acceptWorkforceInvitationRequestSchema.safeParse({
        identityMode: 'new_identity',
        idempotencyKey: 'accept-invite-2',
        acceptanceToken: 'a'.repeat(43),
        password: 'correct horse battery staple',
      }).success,
    ).toBe(true);
    expect(
      acceptWorkforceInvitationRequestSchema.safeParse({
        identityMode: 'new_identity',
        idempotencyKey: 'accept-invite-3',
        acceptanceToken: 'a'.repeat(43),
      }).success,
    ).toBe(false);
  });
});
