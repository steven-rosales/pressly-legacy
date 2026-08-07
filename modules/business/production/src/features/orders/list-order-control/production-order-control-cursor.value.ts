import { defineBoundCursor } from '@pressly/codec';
import type {
  ListProductionOrderControlCommand,
  ProductionOrderControlCursorPoint,
} from './list-production-order-control.model.ts';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const productionOrderControlCursor = defineBoundCursor<
  ListProductionOrderControlCommand,
  ProductionOrderControlCursorPoint
>({
  version: 1,
  projectFilter: (query) => ({
    view: query.view,
    search: query.search ?? null,
    status: query.status ?? null,
    dueBucket: query.dueBucket ?? null,
    productionRunId: query.productionRunId ?? null,
    productionBatchId: query.productionBatchId ?? null,
    stage: query.stage ?? null,
    priority: query.priority ?? null,
    movable: query.movable ?? null,
  }),
  encodePoint: (point) => ({
    dueAt: point.dueAt.toISOString(),
    id: point.id,
  }),
  decodePoint: (encoded) => {
    const dueAt = encoded['dueAt'];
    const id = encoded['id'];
    if (
      typeof dueAt !== 'string' ||
      typeof id !== 'string' ||
      !uuidPattern.test(id)
    )
      return null;

    const parsedDueAt = new Date(dueAt);
    return Number.isFinite(parsedDueAt.getTime())
      ? { dueAt: parsedDueAt, id }
      : null;
  },
});
