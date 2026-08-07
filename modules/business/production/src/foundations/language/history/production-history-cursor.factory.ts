import { defineBoundCursor } from '@pressly/codec';
import { productionHistoryInvariantViolation } from './production-history.error.ts';
import type { ProductionHistoryCursorPoint } from './production-history.model.ts';

type CursorFilterValue = string | number | boolean | null;
type CursorFilter = Readonly<Record<string, CursorFilterValue>>;

type ProductionHistoryCursorDefinition<Filter, Kind extends string> = Readonly<{
  kind: Kind;
  projectFilter: (filter: Filter) => CursorFilter;
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

const isCursorPoint = (
  value: Readonly<Record<string, unknown>>,
): value is ProductionHistoryCursorPoint =>
  typeof value['createdAtKey'] === 'string' &&
  isExactTimestamp(value['createdAtKey']) &&
  typeof value['id'] === 'string' &&
  uuidPattern.test(value['id']);

export const defineProductionHistoryCursor = <Filter, Kind extends string>(
  definition: ProductionHistoryCursorDefinition<Filter, Kind>,
) => {
  const codec = defineBoundCursor<Filter, ProductionHistoryCursorPoint>({
    version: 2,
    kind: definition.kind,
    projectFilter: definition.projectFilter,
    encodePoint: (point) => ({
      createdAtKey: point.createdAtKey,
      id: point.id,
    }),
    decodePoint: (encoded) =>
      isCursorPoint(encoded)
        ? { createdAtKey: encoded.createdAtKey, id: encoded.id }
        : null,
  });

  const encode = (
    filter: Filter,
    point: ProductionHistoryCursorPoint,
  ): string => {
    if (!uuidPattern.test(point.id) || !isExactTimestamp(point.createdAtKey))
      throw productionHistoryInvariantViolation(
        'production_history_cursor_point_invalid',
        'Production-history cursor point is invalid.',
      );

    return codec.encode(filter, point);
  };

  return Object.freeze({
    kind: definition.kind,
    filterKey: codec.filterKey,
    encode,
    decode: codec.decode,
  });
};
