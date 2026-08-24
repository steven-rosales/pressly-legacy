import { defineBoundCursor } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ListHistoryRunsInput } from './types.ts';

export type HistoryRunsCursorPoint = Readonly<{
  createdAtKey: string;
  id: string;
}>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exactTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

const isExactTimestamp = (value: string): boolean => {
  if (!exactTimestampPattern.test(value)) return false;
  const milliseconds = `${value.slice(0, 23)}Z`;
  const parsed = new Date(milliseconds);
  return (
    Number.isFinite(parsed.getTime()) && parsed.toISOString() === milliseconds
  );
};

const codec = defineBoundCursor<ListHistoryRunsInput, HistoryRunsCursorPoint>({
  version: 2,
  kind: 'runs',
  projectFilter: (input) => ({
    search: input.search ?? null,
    status: input.status ?? null,
    createdAfter: input.createdAfter?.toISOString() ?? null,
  }),
  encodePoint: (point) => ({ ...point }),
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

export const historyRunsCursor = Object.freeze({
  filterKey: codec.filterKey,
  decode: codec.decode,
  encode: (
    input: ListHistoryRunsInput,
    point: HistoryRunsCursorPoint,
  ): string => {
    if (!uuidPattern.test(point.id) || !isExactTimestamp(point.createdAtKey))
      throw invariantViolationError({
        code: 'production_history_cursor_point_invalid',
        message: 'Production-history cursor point is invalid.',
        safeMessage: 'Production state is inconsistent.',
      });
    return codec.encode(input, point);
  },
});
