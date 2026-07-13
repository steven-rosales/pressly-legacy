import { describe, expect, it, vi } from 'vitest';
import { makeManageSourceLocationBindings } from '../../src/source-location-bindings/source-location-bindings.usecase.ts';

const binding = {
  source: 'cents',
  externalLocationId: 'store-1',
  locationId: 'location-1',
  isActive: true,
} as const;

const setup = (existing: readonly (typeof binding)[] = []) => {
  const insert = vi.fn(async () => undefined);
  return {
    insert,
    manage: makeManageSourceLocationBindings({
      repo: {
        resolve: vi.fn(async () => null),
        loadAll: vi.fn(async () => existing),
        insert,
      },
      clock: { now: () => new Date('2026-07-10T14:00:00.000Z') },
    }),
  };
};

describe('source-location binding bootstrap', () => {
  it('treats an empty manifest as a non-destructive no-op', async () => {
    const { manage, insert } = setup([binding]);

    await expect(
      manage({
        manifest: { sourceLocationBindings: [] },
        dryRun: false,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'converged',
        applied: true,
        operations: [],
        rejections: [],
      },
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('dry-runs and applies one new generic binding', async () => {
    const dryRun = setup();
    await expect(
      dryRun.manage({
        manifest: { sourceLocationBindings: [binding] },
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'converged', applied: false },
    });
    expect(dryRun.insert).not.toHaveBeenCalled();

    const apply = setup();
    await apply.manage({
      manifest: { sourceLocationBindings: [binding] },
      dryRun: false,
    });
    expect(apply.insert).toHaveBeenCalledWith(
      [binding],
      new Date('2026-07-10T14:00:00.000Z'),
    );
  });

  it('rejects silent reassignment instead of changing production ownership', async () => {
    const { manage, insert } = setup([binding]);
    await expect(
      manage({
        manifest: {
          sourceLocationBindings: [
            { ...binding, locationId: 'another-location' },
          ],
        },
        dryRun: false,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'rejected',
        applied: false,
        rejections: [{ code: 'binding_location_change' }],
      },
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
