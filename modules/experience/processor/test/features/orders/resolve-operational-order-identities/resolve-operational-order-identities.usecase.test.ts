import { describe, expect, it, vi } from 'vitest';
import {
  makeOperationalOrderIdentityQueries,
  makeResolveOperationalOrderIdentities,
} from '../../../../src/features/orders/resolve-operational-order-identities/resolve-operational-order-identities.usecase.ts';
import type { OperationalOrderIdentityPort } from '../../../../src/foundations/ports/operational-order-identity/operational-order-identity.port.ts';

describe('resolve operational order identities', () => {
  it('deduplicates references before invoking the identity adapter', async () => {
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
    const resolveIdentities = makeResolveOperationalOrderIdentities({
      resolve,
    });
    const reference = {
      referenceId: 'production:order-1',
      productionOrderId: 'order-1',
      orderDemandId: null,
      fallbackDisplayNumber: 'ORDER-1',
    } as const;

    const result = await resolveIdentities([reference, reference]);

    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve.mock.calls[0]?.[0]).toEqual([reference]);
    expect(result.get(reference.referenceId)?.identity.displayNumber).toBe(
      'ORDER-1',
    );
  });

  it('owns the identity reference selection for a Processor workspace', async () => {
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
    const queries = makeOperationalOrderIdentityQueries({ resolve });
    const order = { id: 'order-1', externalOrderId: 'ORDER-1' };

    await queries.forWorkspace({
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
