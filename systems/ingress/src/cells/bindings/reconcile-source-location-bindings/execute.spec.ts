import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { reconcileSourceLocationBindingsCellDeclaration } from './cell.ts';
import { makeExecuteReconcileSourceLocationBindings } from './execute.ts';

const binding = {
  source: 'cents',
  externalLocationId: 'store-1',
  locationId: 'location-1',
  isActive: true,
} as const;

describe('reconcile-source-location-bindings execution', () => {
  proveOperation({
    operationId: 'ingress.reconcile-source-location-bindings.v1',
    declaration: reconcileSourceLocationBindingsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'does not write an empty converged manifest',
        proves: ['executor-success'],
        run: async () => {
          const insert = vi.fn(async () => undefined);
          const execute = makeExecuteReconcileSourceLocationBindings({
            repo: {
              transaction: (work) =>
                work({ loadAll: vi.fn(async () => [binding]), insert }),
            },
            clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
          });

          await expect(
            execute({
              manifest: { sourceLocationBindings: [] },
              dryRun: false,
            }),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { status: 'converged', applied: true },
          });
          expect(insert).not.toHaveBeenCalled();
        },
      },
    ],
  });

  it('applies only additions and never a rejected plan', async () => {
    const insert = vi.fn(async () => undefined);
    const execute = makeExecuteReconcileSourceLocationBindings({
      repo: {
        transaction: (work) => work({ loadAll: vi.fn(async () => []), insert }),
      },
      clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
    });
    await execute({
      manifest: { sourceLocationBindings: [binding] },
      dryRun: false,
    });
    expect(insert).toHaveBeenCalledWith(
      [binding],
      new Date('2026-08-22T16:00:00.000Z'),
    );
  });
});
