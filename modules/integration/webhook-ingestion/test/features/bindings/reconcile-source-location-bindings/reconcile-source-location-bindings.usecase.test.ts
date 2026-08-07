import { describe, expect, it, vi } from 'vitest';
import { makeReconcileSourceLocationBindings } from '../../../../src/features/bindings/reconcile-source-location-bindings/reconcile-source-location-bindings.usecase.ts';

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
    reconcile: makeReconcileSourceLocationBindings({
      repo: {
        loadAll: vi.fn(async () => existing),
        insert,
      },
      clock: { now: () => new Date('2026-07-10T14:00:00.000Z') },
    }),
  };
};

describe('source-location binding bootstrap', () => {
  it('treats an empty manifest as a non-destructive no-op', async () => {
    const { reconcile, insert } = setup([binding]);

    await expect(
      reconcile({
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
      dryRun.reconcile({
        manifest: { sourceLocationBindings: [binding] },
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'converged', applied: false },
    });
    expect(dryRun.insert).not.toHaveBeenCalled();

    const apply = setup();
    await apply.reconcile({
      manifest: { sourceLocationBindings: [binding] },
      dryRun: false,
    });
    expect(apply.insert).toHaveBeenCalledWith(
      [binding],
      new Date('2026-07-10T14:00:00.000Z'),
    );
  });

  it('rejects silent reassignment instead of changing production ownership', async () => {
    const { reconcile, insert } = setup([binding]);
    await expect(
      reconcile({
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
