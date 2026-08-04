import { isJsonObject, type JsonObject } from './json-value.ts';
import { decodeBase64UrlJson, encodeBase64UrlJson } from './base64-url.ts';

type CursorFilterValue = string | number | boolean | null;
type CursorFilterProjection = Readonly<Record<string, CursorFilterValue>>;
type EncodedCursorPoint = JsonObject;

export type BoundCursorDefinition<Filter, Point> = Readonly<{
  version: number;
  kind?: string;
  projectFilter: (filter: Filter) => CursorFilterProjection;
  encodePoint: (point: Point) => EncodedCursorPoint;
  decodePoint: (encoded: EncodedCursorPoint) => Point | null;
}>;

export type BoundCursorCodec<Filter, Point> = Readonly<{
  version: number;
  kind: string | null;
  filterKey: (filter: Filter) => string;
  encode: (filter: Filter, point: Point) => string;
  decode: (cursor: string, filter: Filter) => Point | null;
}>;

/**
 * Compiles an opaque cursor codec whose payload is bound to one query shape.
 * The factory owns the transport envelope; callers retain filter projection
 * and cursor-point validation because those are application semantics.
 */
export const defineBoundCursor = <Filter, Point>(
  definition: BoundCursorDefinition<Filter, Point>,
): BoundCursorCodec<Filter, Point> => {
  const kind = definition.kind ?? null;
  const filterKey = (filter: Filter): string =>
    JSON.stringify(definition.projectFilter(filter));

  const encode = (filter: Filter, point: Point): string => {
    const encodedPoint = encodePointWithoutEnvelopeKeys(
      definition.encodePoint(point),
    );

    return encodeBase64UrlJson({
      version: definition.version,
      ...(kind === null ? {} : { kind }),
      filterKey: filterKey(filter),
      ...encodedPoint,
    });
  };

  const decode = (cursor: string, filter: Filter): Point | null => {
    try {
      const encoded = decodeBase64UrlJson(cursor);

      if (
        !isJsonObject(encoded) ||
        encoded['version'] !== definition.version ||
        encoded['filterKey'] !== filterKey(filter) ||
        (kind !== null && encoded['kind'] !== kind)
      )
        return null;

      return definition.decodePoint(encoded);
    } catch {
      return null;
    }
  };

  return Object.freeze({
    version: definition.version,
    kind,
    filterKey,
    encode,
    decode,
  });
};

const encodePointWithoutEnvelopeKeys = (
  point: EncodedCursorPoint,
): EncodedCursorPoint =>
  Object.fromEntries(
    Object.entries(point).filter(
      ([key]) => key !== 'version' && key !== 'kind' && key !== 'filterKey',
    ),
  );
