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

const isCursorPoint = (
  value: Readonly<Record<string, unknown>>,
): value is Readonly<{ createdAt: string; id: string }> =>
  typeof value['createdAt'] === 'string' &&
  typeof value['id'] === 'string' &&
  uuidPattern.test(value['id']);

export const defineProductionHistoryCursor = <Filter, Kind extends string>(
  definition: ProductionHistoryCursorDefinition<Filter, Kind>,
) => {
  const codec = defineBoundCursor<Filter, ProductionHistoryCursorPoint>({
    version: 1,
    kind: definition.kind,
    projectFilter: definition.projectFilter,
    encodePoint: (point) => ({
      createdAt: point.createdAt.toISOString(),
      id: point.id,
    }),
    decodePoint: (encoded) => {
      if (!isCursorPoint(encoded)) return null;
      const createdAt = new Date(encoded.createdAt);
      return Number.isFinite(createdAt.getTime())
        ? { createdAt, id: encoded.id }
        : null;
    },
  });

  const encode = (
    filter: Filter,
    point: ProductionHistoryCursorPoint,
  ): string => {
    if (
      !uuidPattern.test(point.id) ||
      !Number.isFinite(point.createdAt.getTime())
    )
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
