import { describe, expect, it, vi } from 'vitest';
import { makeResolveSourceLocation } from '../../../../src/features/bindings/resolve-source-location/resolve-source-location.usecase.ts';

describe('source-location resolution', () => {
  it('delegates a source-scoped external identifier to the binding store', async () => {
    const resolve = vi.fn(async () => 'location-1');
    const usecase = makeResolveSourceLocation({
      resolve,
      loadAll: vi.fn(async () => []),
      insert: vi.fn(async () => undefined),
    });

    await expect(
      usecase({ source: 'cents', externalLocationId: 'store-1' }),
    ).resolves.toBe('location-1');
    expect(resolve).toHaveBeenCalledWith({
      source: 'cents',
      externalLocationId: 'store-1',
    });
  });
});
