import type {
  ListProcessorOrderControlResult,
  ListProductionOrderControlResult,
  ProcessorOrderContext,
} from '@pressly/contracts';
import { projectSourceComparison } from '@pressly/order-control-projection';
import {
  desc,
  eq,
  inArray,
  laundryProduction,
  orders,
  users,
  type Database,
} from '@pressly/db';

export const makeProcessorOrderControlReadModel = (db: Database) => ({
  compose: async (
    base: ListProductionOrderControlResult,
  ): Promise<ListProcessorOrderControlResult> => {
    if (base.items.length === 0)
      return { ...base, items: [] } satisfies ListProcessorOrderControlResult;

    const productionOrderIds = base.items.map((item) => item.order.id);
    const canonicalRows = await db
      .select({
        productionOrderId: laundryProduction.productionOrders.id,
        canonicalOrderId: orders.orders.id,
        fulfillmentId: orders.orderFulfillments.id,
        displayNumber: orders.orders.displayNumber,
        customerResolution: orders.orders.customerResolution,
        customerUserId: orders.orders.customerUserId,
        firstName: users.users.firstName,
        lastName: users.users.lastName,
        businessName: users.users.businessName,
        phone: users.users.phone,
        commercialState: orders.orders.state,
        admissionState: orders.orderFulfillments.releaseState,
      })
      .from(laundryProduction.productionOrders)
      .innerJoin(
        laundryProduction.orderDemands,
        eq(
          laundryProduction.orderDemands.id,
          laundryProduction.productionOrders.orderDemandId,
        ),
      )
      .innerJoin(
        orders.orderFulfillments,
        eq(
          orders.orderFulfillments.id,
          laundryProduction.orderDemands.fulfillmentId,
        ),
      )
      .innerJoin(
        orders.orders,
        eq(orders.orders.id, orders.orderFulfillments.orderId),
      )
      .leftJoin(users.users, eq(users.users.id, orders.orders.customerUserId))
      .where(
        inArray(laundryProduction.productionOrders.id, productionOrderIds),
      );
    const orderIds = canonicalRows.map((row) => row.canonicalOrderId);
    const sourceRows =
      orderIds.length === 0
        ? []
        : await db
            .select({
              orderId: orders.orderSourceLinks.orderId,
              source: orders.orderSourceLinks.source,
              lifecycleCode: orders.orderSourceSnapshots.sourceLifecycleCode,
              updatedAt: orders.orderSourceSnapshots.updatedAt,
            })
            .from(orders.orderSourceLinks)
            .leftJoin(
              orders.orderSourceSnapshots,
              eq(
                orders.orderSourceSnapshots.sourceLinkId,
                orders.orderSourceLinks.id,
              ),
            )
            .where(inArray(orders.orderSourceLinks.orderId, orderIds))
            .orderBy(desc(orders.orderSourceSnapshots.updatedAt));
    const sourceByOrder = new Map<
      string,
      Readonly<{ name: string; status: string | null }>
    >();
    for (const source of sourceRows) {
      if (sourceByOrder.has(source.orderId)) continue;
      sourceByOrder.set(source.orderId, {
        name: source.source,
        status: source.lifecycleCode,
      });
    }
    const canonicalByProductionOrder = new Map(
      canonicalRows.map((row) => [row.productionOrderId, row]),
    );

    return {
      ...base,
      items: base.items.map((item) => {
        const row = canonicalByProductionOrder.get(item.order.id);
        if (row === undefined) return { ...item, canonical: null };
        const context: ProcessorOrderContext = {
          canonicalOrderId: row.canonicalOrderId,
          canonicalFulfillmentId: row.fulfillmentId,
          displayNumber: row.displayNumber,
          customer: {
            resolution:
              row.customerResolution as ProcessorOrderContext['customer']['resolution'],
            userId: row.customerUserId,
            firstName: row.firstName,
            lastName: row.lastName,
            businessName: row.businessName,
            phone: row.phone,
          },
          commercialState:
            row.commercialState as ProcessorOrderContext['commercialState'],
          admissionState:
            row.admissionState as ProcessorOrderContext['admissionState'],
          source: sourceByOrder.get(row.canonicalOrderId) ?? null,
          comparison: projectSourceComparison({
            sourceAvailable: sourceByOrder.has(row.canonicalOrderId),
            commercialState:
              row.commercialState as ProcessorOrderContext['commercialState'],
            admissionState:
              row.admissionState as ProcessorOrderContext['admissionState'],
            productionStatus: item.order.status,
          }),
        };
        return { ...item, canonical: context };
      }),
    };
  },
});

export type ProcessorOrderControlReadModel = ReturnType<
  typeof makeProcessorOrderControlReadModel
>;
