import { describe, expect, it } from 'vitest';
import { toWorkforceInvitationSummary } from '../../../../../src/foundations/adapters/postgres/workforce-invitation-store/workforce-invitation.persistence.mapper.ts';

describe('toWorkforceInvitationSummary', () => {
  it('projects the stored invitation into the application summary', () => {
    const createdAt = new Date('2026-08-02T12:00:00.000Z');
    const expiresAt = new Date('2026-08-09T12:00:00.000Z');

    expect(
      toWorkforceInvitationSummary({
        id: 'invitation-1',
        businessId: 'business-1',
        emailNormalized: 'operator@example.com',
        displayName: 'Operator One',
        intendedRole: 'operator',
        intendedLocationId: 'location-1',
        state: 'pending',
        version: 1,
        expiresAt,
        createdAt,
      }),
    ).toEqual({
      id: 'invitation-1',
      businessId: 'business-1',
      emailNormalized: 'operator@example.com',
      displayName: 'Operator One',
      intendedRole: 'operator',
      intendedLocationId: 'location-1',
      state: 'pending',
      version: 1,
      expiresAt,
      createdAt,
    });
  });
});
