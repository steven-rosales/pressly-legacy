import type {
  ListProductionHistoryActivityResult,
  ProductionHistoryRunDetail,
  ProductionOrderBacklogPreview,
  ProductionRemainingDayForecast,
  ProductionWorkspace,
} from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalCustomerDisplayName,
  type ProcessorOperationalOrderIdentityResolver,
} from '../../src/http/processor/operational-order-identity/operational-order-identity.query.ts';
import { makeProcessorOperationalOrderReadModel } from '../../src/http/processor/operational-order-identity/operational-order-identity.read-model.ts';

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

const makeResolver = () => {
  const resolve = vi.fn<ProcessorOperationalOrderIdentityResolver['resolve']>(
    async (references) =>
      new Map(
        references.map((reference) => [
          reference.referenceId,
          {
            identity: {
              displayNumber: `canonical:${reference.fallbackDisplayNumber}`,
              customerDisplayName:
                reference.fallbackDisplayNumber === 'NO-CUSTOMER'
                  ? null
                  : `Customer ${reference.fallbackDisplayNumber}`,
            },
            canonical: null,
          },
        ]),
      ),
  );
  return { resolve };
};

describe('Processor operational order identity composition', () => {
  it('uses business, then personal, then unavailable identity without truncating long names', () => {
    expect(
      canonicalCustomerDisplayName({
        businessName: '  Northwind   Hotel ',
        firstName: 'Ignored',
        lastName: 'Person',
      }),
    ).toBe('Northwind Hotel');
    expect(
      canonicalCustomerDisplayName({
        businessName: ' ',
        firstName: ' Camila ',
        lastName: ' Reed ',
      }),
    ).toBe('Camila Reed');
    expect(
      canonicalCustomerDisplayName({
        businessName: null,
        firstName: null,
        lastName: ' ',
      }),
    ).toBeNull();
    const longName = 'A'.repeat(240);
    expect(
      canonicalCustomerDisplayName({
        businessName: longName,
        firstName: null,
        lastName: null,
      }),
    ).toBe(longName);
  });

  it('resolves one deduplicated workspace batch for selection and live-placement rows', async () => {
    const identities = makeResolver();
    const readModel = makeProcessorOperationalOrderReadModel(identities);
    const base = {
      orders: [
        { id: id(1), externalOrderId: 'ORDER-1' },
        { id: id(2), externalOrderId: 'ORDER-2' },
      ],
      pendingEligibleOrders: [{ id: id(2), externalOrderId: 'ORDER-2' }],
      liveRunChanges: {
        orders: [{ id: id(2), externalOrderId: 'ORDER-2' }],
      },
      board: {
        eligibleOrders: [{ id: id(1), externalOrderId: 'ORDER-1' }],
      },
    } as unknown as ProductionWorkspace;

    const composed = await readModel.composeWorkspace(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toHaveLength(2);
    expect(composed.orders[0]?.identity).toEqual({
      displayNumber: 'canonical:ORDER-1',
      customerDisplayName: 'Customer ORDER-1',
    });
    expect(composed.liveRunChanges?.orders[0]?.identity.displayNumber).toBe(
      'canonical:ORDER-2',
    );
  });

  it('resolves every forecast group in one batch, including demand before Production admission', async () => {
    const identities = makeResolver();
    const readModel = makeProcessorOperationalOrderReadModel(identities);
    const base = {
      groups: {
        inProduction: [
          {
            productionOrderId: id(10),
            orderDemandId: id(20),
            externalOrderId: 'IN-PRODUCTION',
          },
        ],
        readyToPlace: [],
        expectedLater: [
          {
            productionOrderId: null,
            orderDemandId: id(21),
            externalOrderId: 'NO-CUSTOMER',
          },
        ],
        needsShift: [],
      },
    } as unknown as ProductionRemainingDayForecast;

    const composed = await readModel.composeForecast(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productionOrderId: null,
          orderDemandId: id(21),
        }),
      ]),
    );
    expect(
      composed.groups.expectedLater[0]?.identity.customerDisplayName,
    ).toBeNull();
  });

  it('resolves all run memberships in one batch and keeps repeated history episodes exact', async () => {
    const identities = makeResolver();
    const readModel = makeProcessorOperationalOrderReadModel(identities);
    const base = {
      orderMemberships: [
        {
          membershipId: id(31),
          productionOrderId: id(30),
          externalOrderId: 'HISTORY-30',
        },
        {
          membershipId: id(32),
          productionOrderId: id(30),
          externalOrderId: 'HISTORY-30',
        },
      ],
    } as unknown as ProductionHistoryRunDetail;

    const composed = await readModel.composeHistoryRun(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toHaveLength(1);
    expect(composed.orderMemberships).toHaveLength(2);
    expect(composed.orderMemberships[1]?.identity.displayNumber).toBe(
      'canonical:HISTORY-30',
    );
  });

  it('resolves all four bounded backlog groups in one batch', async () => {
    const identities = makeResolver();
    const readModel = makeProcessorOperationalOrderReadModel(identities);
    const item = (value: number, category: string) => ({
      orderId: id(value),
      displayReference: `BACKLOG-${value}`,
      category,
    });
    const base = {
      groups: {
        readyToArchive: [item(41, 'ready_to_archive')],
        reviewIndividually: [item(42, 'review_individually')],
        keptForSafety: [item(43, 'kept_for_safety')],
        alreadyHistorical: [item(44, 'already_historical')],
      },
    } as unknown as ProductionOrderBacklogPreview;

    const composed = await readModel.composeBacklogPreview(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toHaveLength(4);
    expect(
      composed.groups.reviewIndividually[0]?.identity.customerDisplayName,
    ).toBe('Customer BACKLOG-42');
    expect(composed.groups.alreadyHistorical[0]?.identity.displayNumber).toBe(
      'canonical:BACKLOG-44',
    );
  });

  it('resolves one activity-page batch for order events and leaves other entities uncomposed', async () => {
    const identities = makeResolver();
    const readModel = makeProcessorOperationalOrderReadModel(identities);
    const base = {
      items: [
        {
          id: id(51),
          entityType: 'production_order',
          entityId: id(52),
        },
        {
          id: id(53),
          entityType: 'production_order',
          entityId: id(52),
        },
        {
          id: id(54),
          entityType: 'schedule_run',
          entityId: id(55),
        },
      ],
    } as unknown as ListProductionHistoryActivityResult;

    const composed = await readModel.composeHistoryActivity(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toHaveLength(1);
    expect(composed.items[0]?.identity?.displayNumber).toBe(
      `canonical:${id(52)}`,
    );
    expect(composed.items[1]?.identity).toEqual(composed.items[0]?.identity);
    expect(composed.items[2]?.identity).toBeNull();
  });
});
