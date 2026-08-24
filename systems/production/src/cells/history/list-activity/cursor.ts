import { defineBoundCursor } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ListHistoryActivityInput } from './types.ts';

export type HistoryActivityCursorPoint = Readonly<{
  createdAtKey: string;
  id: string;
}>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exactTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

const isExactTimestamp = (value: string): boolean => {
  if (!exactTimestampPattern.test(value)) return false;

  const millisecondTimestamp = `${value.slice(0, 23)}Z`;
  const parsed = new Date(millisecondTimestamp);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString() === millisecondTimestamp
  );
};

const codec = defineBoundCursor<
  ListHistoryActivityInput,
  HistoryActivityCursorPoint
>({
  version: 2,
  kind: 'activity',
  projectFilter: (input) => ({
    runId: input.runId ?? null,
    entityType: input.entityType ?? null,
    eventType: input.eventType ?? null,
    orderResolution: input.orderResolution ?? null,
    search: input.search ?? null,
    occurredAfter: input.occurredAfter?.toISOString() ?? null,
  }),
  encodePoint: (point) => ({
    createdAtKey: point.createdAtKey,
    id: point.id,
  }),
  decodePoint: (encoded) => {
    const createdAtKey = encoded['createdAtKey'];
    const id = encoded['id'];
    return typeof createdAtKey === 'string' &&
      isExactTimestamp(createdAtKey) &&
      typeof id === 'string' &&
      uuidPattern.test(id)
      ? { createdAtKey, id }
      : null;
  },
});

const invalidCursorPoint = () =>
  invariantViolationError({
    code: 'production_history_cursor_point_invalid',
    message: 'Production-history cursor point is invalid.',
    safeMessage: 'Production state is inconsistent.',
  });

export const historyActivityCursor = Object.freeze({
  filterKey: codec.filterKey,
  decode: codec.decode,
  encode: (
    input: ListHistoryActivityInput,
    point: HistoryActivityCursorPoint,
  ): string => {
    if (!uuidPattern.test(point.id) || !isExactTimestamp(point.createdAtKey))
      throw invalidCursorPoint();

    return codec.encode(input, point);
  },
});
