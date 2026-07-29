import type {
  ProcessorOperationalOrderIdentity,
  ProcessorListProductionHistoryActivityResult,
  ProcessorProductionOrderBacklogPreview,
  ProcessorProductionBoard,
  ProcessorProductionHistoryRunDetail,
  ProcessorProductionWorkspace,
  ProcessorRemainingDayForecast,
  ListProductionHistoryActivityResult,
  ProductionHistoryRunDetail,
  ProductionOrderBacklogPreview,
  ProductionBoard,
  ProductionRemainingDayForecast,
  ProductionWorkspace,
} from '@pressly/contracts';
import type {
  ProcessorOperationalOrderIdentityReference,
  ProcessorOperationalOrderIdentityResolver,
} from './operational-order-identity.query.ts';

const productionReferenceId = (productionOrderId: string) =>
  `production:${productionOrderId}`;
const demandReferenceId = (orderDemandId: string) => `demand:${orderDemandId}`;

const resolveReferences = async (
  resolver: ProcessorOperationalOrderIdentityResolver,
  references: readonly ProcessorOperationalOrderIdentityReference[],
): Promise<ReadonlyMap<string, ProcessorOperationalOrderIdentity>> => {
  const uniqueReferences = new Map(
    references.map((reference) => [reference.referenceId, reference]),
  );
  const resolved = await resolver.resolve([...uniqueReferences.values()]);
  return new Map(
    [...resolved.entries()].map(([referenceId, value]) => [
      referenceId,
      value.identity,
    ]),
  );
};

const requireIdentity = (
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
  referenceId: string,
): ProcessorOperationalOrderIdentity => {
  const identity = identities.get(referenceId);
  if (identity === undefined)
    throw new Error(
      `Processor order identity was not resolved for ${referenceId}.`,
    );
  return identity;
};

const boardOrderReferences = (
  board: ProductionBoard | null,
): ProcessorOperationalOrderIdentityReference[] =>
  board?.batches.flatMap((batch) =>
    batch.orders.map((order) => ({
      referenceId: productionReferenceId(order.id),
      productionOrderId: order.id,
      orderDemandId: null,
      fallbackDisplayNumber: order.externalOrderId,
    })),
  ) ?? [];

const identifyBoard = (
  board: ProductionBoard,
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
): ProcessorProductionBoard => ({
  ...board,
  batches: board.batches.map((batch) => ({
    ...batch,
    orders: batch.orders.map((order) => ({
      ...order,
      identity: requireIdentity(identities, productionReferenceId(order.id)),
    })),
  })),
});

export const makeProcessorOperationalOrderReadModel = (
  identities: ProcessorOperationalOrderIdentityResolver,
) => ({
  composeBoard: async (
    base: ProductionBoard,
  ): Promise<ProcessorProductionBoard> => {
    const resolved = await resolveReferences(
      identities,
      boardOrderReferences(base),
    );
    return identifyBoard(base, resolved);
  },

  composeWorkspace: async (
    base: ProductionWorkspace,
  ): Promise<ProcessorProductionWorkspace> => {
    const batchOrders =
      base.board?.batches.flatMap((batch) => batch.orders) ?? [];
    const pendingOrders = [
      ...base.pendingEligibleOrders,
      ...(base.liveRunChanges?.orders ?? []),
      ...batchOrders,
    ];
    const references = [
      ...base.orders.map((order) => ({
        referenceId: productionReferenceId(order.id),
        productionOrderId: order.id,
        orderDemandId: null,
        fallbackDisplayNumber: order.externalOrderId,
      })),
      ...pendingOrders.map((order) => ({
        referenceId: productionReferenceId(order.id),
        productionOrderId: order.id,
        orderDemandId: null,
        fallbackDisplayNumber: order.externalOrderId,
      })),
    ];
    const resolved = await resolveReferences(identities, references);
    const identify = <Order extends Readonly<{ id: string }>>(
      order: Order,
    ) => ({
      ...order,
      identity: requireIdentity(resolved, productionReferenceId(order.id)),
    });

    return {
      ...base,
      orders: base.orders.map(identify),
      pendingEligibleOrders: base.pendingEligibleOrders.map(identify),
      liveRunChanges:
        base.liveRunChanges === null
          ? null
          : {
              ...base.liveRunChanges,
              orders: base.liveRunChanges.orders.map(identify),
            },
      board: base.board === null ? null : identifyBoard(base.board, resolved),
    };
  },

  composeForecast: async (
    base: ProductionRemainingDayForecast,
  ): Promise<ProcessorRemainingDayForecast> => {
    const items = [
      ...base.groups.inProduction,
      ...base.groups.readyToPlace,
      ...base.groups.expectedLater,
      ...base.groups.needsShift,
    ];
    const references = items.map((item) => ({
      referenceId:
        item.productionOrderId === null
          ? demandReferenceId(item.orderDemandId)
          : productionReferenceId(item.productionOrderId),
      productionOrderId: item.productionOrderId,
      orderDemandId: item.orderDemandId,
      fallbackDisplayNumber: item.externalOrderId,
    }));
    const resolved = await resolveReferences(identities, references);
    const identify = <
      Item extends Readonly<{
        productionOrderId: string | null;
        orderDemandId: string;
      }>,
    >(
      item: Item,
    ) => ({
      ...item,
      identity: requireIdentity(
        resolved,
        item.productionOrderId === null
          ? demandReferenceId(item.orderDemandId)
          : productionReferenceId(item.productionOrderId),
      ),
    });

    return {
      ...base,
      groups: {
        inProduction: base.groups.inProduction.map(identify),
        readyToPlace: base.groups.readyToPlace.map(identify),
        expectedLater: base.groups.expectedLater.map(identify),
        needsShift: base.groups.needsShift.map(identify),
      },
    };
  },

  composeHistoryRun: async (
    base: ProductionHistoryRunDetail,
  ): Promise<ProcessorProductionHistoryRunDetail> => {
    const references = base.orderMemberships.map((membership) => ({
      referenceId: productionReferenceId(membership.productionOrderId),
      productionOrderId: membership.productionOrderId,
      orderDemandId: null,
      fallbackDisplayNumber: membership.externalOrderId,
    }));
    const resolved = await resolveReferences(identities, references);
    return {
      ...base,
      orderMemberships: base.orderMemberships.map((membership) => ({
        ...membership,
        identity: requireIdentity(
          resolved,
          productionReferenceId(membership.productionOrderId),
        ),
      })),
    };
  },

  composeBacklogPreview: async (
    base: ProductionOrderBacklogPreview,
  ): Promise<ProcessorProductionOrderBacklogPreview> => {
    const items = [
      ...base.groups.readyToArchive,
      ...base.groups.reviewIndividually,
      ...base.groups.keptForSafety,
      ...base.groups.alreadyHistorical,
    ];
    const references = items.map((item) => ({
      referenceId: productionReferenceId(item.orderId),
      productionOrderId: item.orderId,
      orderDemandId: null,
      fallbackDisplayNumber: item.displayReference,
    }));
    const resolved = await resolveReferences(identities, references);
    const identify = <
      Item extends Readonly<{ orderId: string; displayReference: string }>,
    >(
      item: Item,
    ) => ({
      ...item,
      identity: requireIdentity(resolved, productionReferenceId(item.orderId)),
    });

    return {
      ...base,
      groups: {
        readyToArchive: base.groups.readyToArchive.map(identify),
        reviewIndividually: base.groups.reviewIndividually.map(identify),
        keptForSafety: base.groups.keptForSafety.map(identify),
        alreadyHistorical: base.groups.alreadyHistorical.map(identify),
      },
    };
  },

  composeHistoryActivity: async (
    base: ListProductionHistoryActivityResult,
  ): Promise<ProcessorListProductionHistoryActivityResult> => {
    const orderItems = base.items.filter(
      (item) => item.entityType === 'production_order',
    );
    const references = orderItems.map((item) => ({
      referenceId: productionReferenceId(item.entityId),
      productionOrderId: item.entityId,
      orderDemandId: null,
      fallbackDisplayNumber: item.entityId,
    }));
    const resolved = await resolveReferences(identities, references);

    return {
      ...base,
      items: base.items.map((item) => ({
        ...item,
        identity:
          item.entityType === 'production_order'
            ? requireIdentity(resolved, productionReferenceId(item.entityId))
            : null,
      })),
    };
  },
});

export type ProcessorOperationalOrderReadModel = ReturnType<
  typeof makeProcessorOperationalOrderReadModel
>;
