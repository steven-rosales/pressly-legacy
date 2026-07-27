import type {
  ListProcessorOrderControlResult,
  ListProductionOrderControlResult,
  ProcessorOrderContext,
} from '@pressly/contracts';
import { desc, eq, inArray, orders, type Database } from '@pressly/db';
import type { ProcessorOperationalOrderIdentityResolver } from '../operational-order-identity/operational-order-identity.query.ts';

export const makeProcessorOrderControlReadModel = (input: {
  db: Database;
  identities: ProcessorOperationalOrderIdentityResolver;
}) => ({
  compose: async (
    base: ListProductionOrderControlResult,
  ): Promise<ListProcessorOrderControlResult> => {
    if (base.items.length === 0)
      return { ...base, items: [] } satisfies ListProcessorOrderControlResult;

    const identityByOrder = await input.identities.resolve(
      base.items.map((item) => ({
        referenceId: item.order.id,
        productionOrderId: item.order.id,
        orderDemandId: null,
        fallbackDisplayNumber: item.order.externalOrderId,
      })),
    );
    const orderIds = [
      ...new Set(
        [...identityByOrder.values()].flatMap((resolved) =>
          resolved.canonical === null
            ? []
            : [resolved.canonical.canonicalOrderId],
        ),
      ),
    ];
    const sourceRows =
      orderIds.length === 0
        ? []
        : await input.db
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
    return {
      ...base,
      items: base.items.map((item) => {
        const resolved = identityByOrder.get(item.order.id);
        if (resolved === undefined)
          throw new Error(
            `Processor order identity was not resolved for ${item.order.id}.`,
          );
        const context: ProcessorOrderContext | null =
          resolved.canonical === null
            ? null
            : {
                ...resolved.canonical,
                source:
                  sourceByOrder.get(resolved.canonical.canonicalOrderId) ??
                  null,
              };
        return {
          ...item,
          identity: resolved.identity,
          canonical: context,
        };
      }),
    };
  },
});

export type ProcessorOrderControlReadModel = ReturnType<
  typeof makeProcessorOrderControlReadModel
>;
