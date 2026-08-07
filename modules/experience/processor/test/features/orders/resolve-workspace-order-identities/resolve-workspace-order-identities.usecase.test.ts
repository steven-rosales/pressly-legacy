import { describe, expect, it, vi } from 'vitest';
import { makeResolveWorkspaceOrderIdentities } from '../../../../src/features/orders/resolve-workspace-order-identities/resolve-workspace-order-identities.usecase.ts';
import type { OperationalOrderIdentityPort } from '../../../../src/foundations/ports/operational-order-identity/operational-order-identity.port.ts';

describe('resolve workspace order identities', () => {
  it('owns reference selection and deduplicates before resolving', async () => {
    const resolve = vi.fn<OperationalOrderIdentityPort['resolve']>(
      async (references) =>
        new Map(
          references.map((reference) => [
            reference.referenceId,
            {
              identity: {
                displayNumber: reference.fallbackDisplayNumber,
                customerDisplayName: null,
              },
              canonical: null,
            },
          ]),
        ),
    );
    const resolveWorkspace = makeResolveWorkspaceOrderIdentities({ resolve });
    const order = { id: 'order-1', externalOrderId: 'ORDER-1' };

    await resolveWorkspace({
      orders: [order],
      pendingEligibleOrders: [order],
      liveRunChanges: { orders: [order] },
      board: { batches: [{ orders: [order] }] },
    });

    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve.mock.calls[0]?.[0]).toEqual([
      {
        referenceId: 'production:order-1',
        productionOrderId: 'order-1',
        orderDemandId: null,
        fallbackDisplayNumber: 'ORDER-1',
      },
    ]);
  });
});
