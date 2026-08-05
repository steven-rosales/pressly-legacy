import { describe, expect, it, vi } from 'vitest';
import { makeResolveProcessorAccess } from '../../../../src/features/session/resolve-processor-access/resolve-processor-access.usecase.ts';
import type { ProcessorSession } from '../../../../src/features/session/resolve-processor-access/resolve-processor-access.model.ts';

const now = new Date('2026-08-03T16:00:00.000Z');
const session: ProcessorSession = {
  principal: {
    identityId: 'identity-1',
    kind: 'human',
    displayName: 'Operator One',
  },
  principalAttributes: {
    identityActive: true,
    assuranceLevel: 'mfa',
    assignments: [
      {
        role: 'manager',
        scope: { kind: 'business', id: 'business-1' },
      },
    ],
  },
};

describe('resolve Processor access', () => {
  it('projects only readable locations and one unambiguous Control destination', async () => {
    const listActive = vi.fn(async () => [
      {
        id: 'location-1',
        businessId: 'business-1',
        name: 'Pressly One',
        timezone: 'America/New_York',
      },
      {
        id: 'location-2',
        businessId: 'business-2',
        name: 'Pressly Two',
        timezone: 'America/New_York',
      },
    ]);
    const resolveForLocation = vi.fn(({ location }) =>
      location.id === 'location-1'
        ? (['production:read', 'production:override'] as const)
        : ([] as const),
    );
    const resolveAccess = makeResolveProcessorAccess({
      listLocations: listActive,
      resolveCapabilities: resolveForLocation,
      origins: {
        processor: 'https://processor.trypressly.com',
        control: 'https://control.trypressly.com',
      },
      clock: { now: () => now },
    });

    const access = await resolveAccess(session);

    expect(access?.locations).toEqual([
      {
        id: 'location-1',
        name: 'Pressly One',
        timezone: 'America/New_York',
        capabilities: [
          'processor:view',
          'production:read',
          'production:override',
        ],
      },
    ]);
    expect(access?.applications.map(({ id }) => id)).toEqual([
      'processor',
      'control',
    ]);
    expect(resolveForLocation).toHaveBeenCalledTimes(2);
  });

  it('returns no access when authorization exposes no readable location', async () => {
    const resolveAccess = makeResolveProcessorAccess({
      listLocations: async () => [
        {
          id: 'location-1',
          businessId: 'business-1',
          name: 'Pressly One',
          timezone: 'America/New_York',
        },
      ],
      resolveCapabilities: () => [],
      origins: {
        processor: 'https://processor.trypressly.com',
        control: 'https://control.trypressly.com',
      },
      clock: { now: () => now },
    });

    await expect(resolveAccess(session)).resolves.toBeNull();
  });
});
