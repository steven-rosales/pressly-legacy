import {
  businessScope,
  globalScope,
  locationScope,
} from '@pressly/auth/authorization';
import { describe, expect, it, vi } from 'vitest';
import { makeResolveProductionVisibility } from '../../../../src/features/scopes/resolve-production-visibility/resolve-production-visibility.usecase.ts';

const now = new Date('2026-08-03T12:00:00.000Z');

describe('resolve Production visibility', () => {
  it('unions active direct and business-derived locations deterministically', async () => {
    const listLocationIdsForBusinesses = vi.fn(async () => [
      'derived-location',
      'direct-location',
    ]);
    const resolve = makeResolveProductionVisibility({
      ancestry: { listLocationIdsForBusinesses },
      clock: { now: () => new Date(now) },
    });

    await expect(
      resolve({
        principalAttributes: {
          identityActive: true,
          assignments: [
            { role: 'operator', scope: locationScope('direct-location') },
            { role: 'manager', scope: businessScope('business-b') },
            { role: 'owner', scope: businessScope('business-a') },
            { role: 'customer', scope: locationScope('customer-location') },
          ],
        },
      }),
    ).resolves.toEqual(['derived-location', 'direct-location']);
    expect(listLocationIdsForBusinesses).toHaveBeenCalledWith([
      'business-b',
      'business-a',
    ]);
  });

  it('represents active global visibility as null without expanding ancestry', async () => {
    const listLocationIdsForBusinesses = vi.fn(async () => ['unexpected']);
    const resolve = makeResolveProductionVisibility({
      ancestry: { listLocationIdsForBusinesses },
      clock: { now: () => new Date(now) },
    });

    await expect(
      resolve({
        principalAttributes: {
          identityActive: true,
          assignments: [{ role: 'admin', scope: globalScope() }],
        },
      }),
    ).resolves.toBeNull();
    expect(listLocationIdsForBusinesses).not.toHaveBeenCalled();
  });

  it('ignores expired, revoked, and non-Production assignments', async () => {
    const listLocationIdsForBusinesses = vi.fn(async () => []);
    const resolve = makeResolveProductionVisibility({
      ancestry: { listLocationIdsForBusinesses },
      clock: { now: () => new Date(now) },
    });

    await expect(
      resolve({
        principalAttributes: {
          identityActive: true,
          assignments: [
            {
              role: 'operator',
              scope: locationScope('expired'),
              endsAt: new Date(now.getTime() - 1),
            },
            {
              role: 'manager',
              scope: businessScope('revoked'),
              state: 'revoked',
            },
            { role: 'customer', scope: globalScope() },
          ],
        },
      }),
    ).resolves.toEqual([]);
    expect(listLocationIdsForBusinesses).not.toHaveBeenCalled();
  });
});
