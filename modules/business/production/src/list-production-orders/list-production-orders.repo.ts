import {
  and,
  asc,
  eq,
  gt,
  laundryProduction,
  lt,
  type Database,
} from '@pressly/db';
import {
  decodeProductionOrderCursor,
  encodeProductionOrderCursor,
  mapProductionOrderListItem,
} from './list-production-orders.mapper.ts';
import type { ListProductionOrdersRepository } from './list-production-orders.port.ts';

export const makeListProductionOrdersRepository = (
  db: Database,
): ListProductionOrdersRepository => ({
  listOrders: async (command, now) => {
    const cursorOrderId =
      command.cursor === undefined
        ? undefined
        : decodeProductionOrderCursor(command.cursor);
    if (cursorOrderId === null) return { tag: 'invalid_cursor' };

    const [location] = await db
      .select({ id: laundryProduction.productionLocations.id })
      .from(laundryProduction.productionLocations)
      .where(
        and(
          eq(laundryProduction.productionLocations.id, command.locationId),
          eq(laundryProduction.productionLocations.isActive, true),
        ),
      )
      .limit(1);
    if (location === undefined) return { tag: 'location_not_found' };

    const rows = await db
      .select({
        id: laundryProduction.productionOrders.id,
        locationId: laundryProduction.productionOrders.locationId,
        externalOrderId: laundryProduction.orderDemands.displayReference,
        dueAt: laundryProduction.productionOrders.dueAt,
        priority: laundryProduction.productionOrders.priority,
        status: laundryProduction.productionOrders.status,
        derivedWeightLbs: laundryProduction.productionOrders.derivedWeightLbs,
        bagCount: laundryProduction.productionOrders.bagCount,
        bagCountSource: laundryProduction.productionOrders.bagCountSource,
        intakeVersion: laundryProduction.productionOrders.intakeVersion,
        version: laundryProduction.productionOrders.version,
      })
      .from(laundryProduction.productionOrders)
      .innerJoin(
        laundryProduction.orderDemands,
        and(
          eq(
            laundryProduction.orderDemands.id,
            laundryProduction.productionOrders.orderDemandId,
          ),
          eq(
            laundryProduction.orderDemands.locationId,
            laundryProduction.productionOrders.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(laundryProduction.productionOrders.locationId, command.locationId),
          command.status === undefined
            ? undefined
            : eq(laundryProduction.productionOrders.status, command.status),
          command.dueAfter === undefined
            ? undefined
            : gt(
                laundryProduction.productionOrders.dueAt,
                new Date(command.dueAfter),
              ),
          command.dueBefore === undefined
            ? undefined
            : lt(
                laundryProduction.productionOrders.dueAt,
                new Date(command.dueBefore),
              ),
          cursorOrderId === undefined
            ? undefined
            : gt(laundryProduction.productionOrders.id, cursorOrderId),
        ),
      )
      .orderBy(asc(laundryProduction.productionOrders.id))
      .limit(command.limit + 1);

    const hasNextPage = rows.length > command.limit;
    const pageRows = rows.slice(0, command.limit);
    const items = pageRows.map((row) => mapProductionOrderListItem(row, now));
    const last = pageRows.at(-1);

    return {
      tag: 'found',
      value: {
        items,
        nextCursor:
          hasNextPage && last !== undefined
            ? encodeProductionOrderCursor(last.id)
            : null,
        asOf: now.toISOString(),
      },
    };
  },
});
