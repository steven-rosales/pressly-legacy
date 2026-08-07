import type {
  ListProductionOrderControlQuery,
  ListProductionOrderControlResult as ListProductionOrderControlWireResult,
  ProductionOrderCommandCapabilities as ProductionOrderWireCommandCapabilities,
  ProductionOrderControlItem as ProductionOrderControlWireItem,
  ProductionOrderResolutionAvailability as ProductionOrderWireResolutionAvailability,
  ProductionOrderRouteAttempt as ProductionOrderWireRouteAttempt,
} from '@pressly/contracts/production';
import { utcIsoFromDate } from '@pressly/time';
import type { ProductionOrderListItem } from '../../../foundations/language/orders/production-order-list-item.model.ts';
import type {
  ListProductionOrderControlCommand,
  ListProductionOrderControlResult,
  ProductionOrderCommandCapabilities,
  ProductionOrderControlItem,
  ProductionOrderRouteAttempt,
} from './list-production-order-control.model.ts';

export const toListProductionOrderControlCommand = (
  locationId: string,
  query: ListProductionOrderControlQuery,
): ListProductionOrderControlCommand => ({
  locationId,
  view: query.view,
  ...(query.search === undefined ? {} : { search: query.search }),
  ...(query.status === undefined ? {} : { status: query.status }),
  ...(query.dueBucket === undefined ? {} : { dueBucket: query.dueBucket }),
  ...(query.productionRunId === undefined
    ? {}
    : { productionRunId: query.productionRunId }),
  ...(query.productionBatchId === undefined
    ? {}
    : { productionBatchId: query.productionBatchId }),
  ...(query.stage === undefined ? {} : { stage: query.stage }),
  ...(query.priority === undefined ? {} : { priority: query.priority }),
  ...(query.movable === undefined ? {} : { movable: query.movable }),
  ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  limit: query.limit,
});

export const toProductionOrderControlListItem = (
  order: ProductionOrderListItem,
): ProductionOrderControlWireItem['order'] => ({
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

const toRouteAttempt = (
  attempt: ProductionOrderRouteAttempt,
): ProductionOrderWireRouteAttempt => ({
  ...attempt,
  assignedAt: utcIsoFromDate(attempt.assignedAt),
  completedAt:
    attempt.completedAt === null ? null : utcIsoFromDate(attempt.completedAt),
  releasedAt:
    attempt.releasedAt === null ? null : utcIsoFromDate(attempt.releasedAt),
});

const toCommandCapabilities = (
  capabilities: ProductionOrderCommandCapabilities,
): ProductionOrderWireCommandCapabilities => ({
  queuedMove:
    capabilities.queuedMove.status === 'allowed'
      ? {
          status: 'allowed',
          expectedQueueVersion: capabilities.queuedMove.expectedQueueVersion,
          expectedOrderVersion: capabilities.queuedMove.expectedOrderVersion,
          expectedSourceBatchVersion:
            capabilities.queuedMove.expectedSourceBatchVersion,
          targets: capabilities.queuedMove.targets.map((target) => ({
            ...target,
            feasibility: { ...target.feasibility },
          })),
        }
      : {
          status: 'blocked',
          code: capabilities.queuedMove.code,
          targets: capabilities.queuedMove.targets.map((target) => ({
            ...target,
            feasibility: { ...target.feasibility },
          })),
        },
  routeException:
    capabilities.routeException.status === 'allowed'
      ? { ...capabilities.routeException }
      : { ...capabilities.routeException },
});

const toResolutionAvailability = (
  availability: ProductionOrderControlItem['resolutionAction'],
): ProductionOrderWireResolutionAvailability =>
  availability.status === 'allowed'
    ? { ...availability, reviewReasons: [...availability.reviewReasons] }
    : { ...availability, reasons: [...availability.reasons] };

const toOrderControlItem = (
  item: ProductionOrderControlItem,
): ProductionOrderControlWireItem => ({
  order: toProductionOrderControlListItem(item.order),
  admission: {
    ...item.admission,
    allowedActions: [...item.admission.allowedActions],
  },
  attention: item.attention === null ? null : { ...item.attention },
  currentPlacement:
    item.currentPlacement === null
      ? null
      : {
          ...item.currentPlacement,
          pinnedAt:
            item.currentPlacement.pinnedAt === null
              ? null
              : utcIsoFromDate(item.currentPlacement.pinnedAt),
        },
  nextRequiredStage: item.nextRequiredStage,
  routeAttempts: item.routeAttempts.map(toRouteAttempt),
  commands: toCommandCapabilities(item.commands),
  resolutionAction: toResolutionAvailability(item.resolutionAction),
});

export const toListProductionOrderControlResult = (
  result: ListProductionOrderControlResult,
): ListProductionOrderControlWireResult => ({
  items: result.items.map(toOrderControlItem),
  counts: { ...result.counts },
  nextCursor: result.nextCursor,
  asOf: utcIsoFromDate(result.asOf),
});
