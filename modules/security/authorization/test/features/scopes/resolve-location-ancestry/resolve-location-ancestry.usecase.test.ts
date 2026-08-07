import { describe, expect, it, vi } from 'vitest';
import { makeResolveLocationAncestry } from '../../../../src/features/scopes/resolve-location-ancestry/resolve-location-ancestry.usecase.ts';

describe('resolve location ancestry', () => {
  it('derives the business from the canonical ancestry port', async () => {
    const resolveBusinessId = vi.fn(async () => 'business-1');
    const resolve = makeResolveLocationAncestry({ resolveBusinessId });

    await expect(resolve('location-1')).resolves.toEqual({
      locationId: 'location-1',
      businessId: 'business-1',
    });
    expect(resolveBusinessId).toHaveBeenCalledWith('location-1');
  });
});
