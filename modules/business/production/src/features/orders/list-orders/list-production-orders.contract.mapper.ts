export {
  listProductionOrdersQuerySchema,
  listProductionOrdersResultSchema,
  productionLocationParamsSchema,
} from '@pressly/contracts/production';
import type {
  ListProductionOrdersQuery,
  ListProductionOrdersResult,
  ProductionOrderListItem as ProductionOrderListItemResult,
} from '@pressly/contracts/production';
import { utcIsoFromDate } from '@pressly/time';
import type { ProductionOrderListItem } from '../../../foundations/language/orders/production-order-list-item.model.ts';
import type {
  ListProductionOrdersCommand,
  ProductionOrderPage,
} from './list-production-orders.model.ts';

export const toListProductionOrdersCommand = (
  locationId: string,
  query: ListProductionOrdersQuery,
): ListProductionOrdersCommand => ({
  locationId,
  ...(query.status === undefined ? {} : { status: query.status }),
  ...(query.dueAfter === undefined
    ? {}
    : { dueAfter: new Date(query.dueAfter) }),
  ...(query.dueBefore === undefined
    ? {}
    : { dueBefore: new Date(query.dueBefore) }),
  ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  limit: query.limit,
});

export const toProductionOrderListItemResult = (
  order: ProductionOrderListItem,
): ProductionOrderListItemResult => ({
  id: order.id,
  locationId: order.locationId,
  externalOrderId: order.externalOrderId,
  dueAt: utcIsoFromDate(order.dueAt),
  dueBucket: order.dueBucket,
  priority: order.priority,
  status: order.status,
  derivedWeightLbs: order.derivedWeightLbs,
  bagCount: order.bagCount,
  bagCountProvenance: order.bagCountProvenance,
  intakeVersion: order.intakeVersion,
  version: order.version,
});

export const toListProductionOrdersResult = (
  page: ProductionOrderPage,
): ListProductionOrdersResult => ({
  items: page.items.map(toProductionOrderListItemResult),
  nextCursor: page.nextCursor,
  asOf: utcIsoFromDate(page.asOf),
});
