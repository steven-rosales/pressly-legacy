import { defineBoundCursor } from '@pressly/codec';
import type {
  ListOrderControlInput,
  OrderControlCursorPoint,
} from './types.ts';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const orderControlCursor = defineBoundCursor<
  ListOrderControlInput,
  OrderControlCursorPoint
>({
  version: 1,
  projectFilter: (input) => ({
    view: input.view,
    search: input.search ?? null,
    status: input.status ?? null,
    dueBucket: input.dueBucket ?? null,
    productionRunId: input.productionRunId ?? null,
    productionBatchId: input.productionBatchId ?? null,
    stage: input.stage ?? null,
    priority: input.priority ?? null,
    movable: input.movable ?? null,
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
