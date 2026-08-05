import { describe, expect, it, vi } from 'vitest';
import { makeResolveControlAccess } from '../../../../src/features/session/resolve-control-access/resolve-control-access.usecase.ts';

const now = new Date('2026-08-03T16:00:00.000Z');

describe('resolve Control access', () => {
  it('selects one business, filters scoped locations, and publishes destinations', async () => {
    const store = {
      loadEffectiveGrants: vi.fn(async () => [
        {
          businessId: 'business-1',
          businessName: 'Pressly',
          role: 'manager',
          scopeKind: 'location',
          scopeId: 'east',
        },
        {
          businessId: 'business-1',
          businessName: 'Pressly',
          role: 'operator',
          scopeKind: 'location',
          scopeId: 'west',
        },
      ]),
      listActiveLocations: vi.fn(async () => [
        { id: 'east', name: 'East', timezone: 'America/New_York' },
        { id: 'west', name: 'West', timezone: 'America/New_York' },
      ]),
    };
    const resolve = makeResolveControlAccess({
      repo: store,
      clock: { now: () => now },
      controlOrigin: 'https://control.example.com',
      processorOrigin: 'https://processor.example.com',
    });

    const access = await resolve({
      identityId: 'identity-1',
      assuranceLevel: 'mfa',
    });

    expect(store.loadEffectiveGrants).toHaveBeenCalledWith({
      identityId: 'identity-1',
      now,
    });
    expect(access?.locations.map((location) => location.id)).toEqual(['east']);
    expect(access?.selectedLocationId).toBe('east');
    expect(access?.applications.map((application) => application.id)).toEqual([
      'control',
      'processor',
    ]);
  });

  it('fails closed when Control grants span businesses', async () => {
    const resolve = makeResolveControlAccess({
      repo: {
        loadEffectiveGrants: async () => [
          {
            businessId: 'business-1',
            businessName: 'One',
            role: 'owner',
            scopeKind: 'business',
            scopeId: 'business-1',
          },
          {
            businessId: 'business-2',
            businessName: 'Two',
            role: 'manager',
            scopeKind: 'business',
            scopeId: 'business-2',
          },
        ],
        listActiveLocations: async () => [],
      },
      clock: { now: () => now },
      controlOrigin: 'https://control.example.com',
      processorOrigin: 'https://processor.example.com',
    });

    await expect(
      resolve({ identityId: 'identity-1', assuranceLevel: 'mfa' }),
    ).resolves.toBeNull();
  });
});
