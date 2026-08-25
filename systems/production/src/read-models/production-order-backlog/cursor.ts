import {
  decodeBase64UrlJson,
  encodeBase64UrlJson,
  isJsonObject,
  type JsonObject,
} from '@pressly/codec';
import { sha256Text } from '@pressly/codec/node';
import { productionIdSchema } from '../production-order/contract.ts';
import { productionOrderBacklogCursorSchema } from './contract.ts';
import type {
  ProductionOrderBacklogCursorCodec,
  ProductionOrderBacklogCursorFailure,
  ProductionOrderBacklogCursorPoint,
  ProductionOrderBacklogScope,
} from './model.ts';

type CursorScope = Pick<
  ProductionOrderBacklogScope,
  'locationId' | 'filter' | 'cutoff' | 'reason'
>;
type EncodedCursorPoint = CursorScope &
  Readonly<{
    version: 1;
    dueAt: string;
    orderId: string;
  }>;

const invalidCursor = (): ProductionOrderBacklogCursorFailure => ({
  code: 'production_order_backlog_cursor_invalid',
  message: 'The backlog cursor is invalid.',
});

const scopeMismatch = (): ProductionOrderBacklogCursorFailure => ({
  code: 'production_order_backlog_cursor_scope_mismatch',
  message: 'The backlog cursor does not belong to this review scope.',
});

const isCanonicalInstant = (value: unknown): value is string =>
  typeof value === 'string' &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const isReason = (value: unknown): value is CursorScope['reason'] =>
  value === 'completed_outside_pressly' ||
  value === 'processor_not_in_use' ||
  value === 'duplicate_or_test' ||
  value === 'order_will_not_be_produced' ||
  value === 'other';

const decodePoint = (encodedPoint: string): EncodedCursorPoint | null => {
  const encoded = decodeBase64UrlJson(encodedPoint);
  if (!isJsonObject(encoded)) return null;

  const version = encoded['version'];
  const locationId = encoded['locationId'];
  const filter = encoded['filter'];
  const cutoff = encoded['cutoff'];
  const reason = encoded['reason'];
  const dueAt = encoded['dueAt'];
  const orderId = encoded['orderId'];
  if (
    version !== 1 ||
    typeof locationId !== 'string' ||
    filter !== 'all_due_before_cutoff' ||
    !isCanonicalInstant(cutoff) ||
    !isReason(reason) ||
    !isCanonicalInstant(dueAt) ||
    typeof orderId !== 'string' ||
    !productionIdSchema.safeParse(orderId).success
  )
    return null;

  return { version, locationId, filter, cutoff, reason, dueAt, orderId };
};

const checksum = (encodedPoint: string): string =>
  sha256Text(`pressly:production-order-backlog-cursor:v1\0${encodedPoint}`);

const belongsTo = (point: EncodedCursorPoint, scope: CursorScope): boolean =>
  point.locationId === scope.locationId &&
  point.filter === scope.filter &&
  point.cutoff === scope.cutoff &&
  point.reason === scope.reason;

export const defineProductionOrderBacklogCursor =
  (): ProductionOrderBacklogCursorCodec =>
    Object.freeze({
      encode: (
        scope: CursorScope,
        point: ProductionOrderBacklogCursorPoint,
      ) => {
        const payload: JsonObject = {
          version: 1,
          locationId: scope.locationId,
          filter: scope.filter,
          cutoff: scope.cutoff,
          reason: scope.reason,
          dueAt: point.dueAt.toISOString(),
          orderId: point.orderId,
        };
        const encodedPoint = encodeBase64UrlJson(payload);
        return productionOrderBacklogCursorSchema.parse(
          `${encodedPoint}.${checksum(encodedPoint)}`,
        );
      },
      decode: (cursor, scope) => {
        if (cursor === null) return { kind: 'valid', point: null };

        const parts = cursor.split('.');
        const encodedPoint = parts[0];
        const suppliedChecksum = parts[1];
        if (
          parts.length !== 2 ||
          encodedPoint === undefined ||
          suppliedChecksum === undefined ||
          suppliedChecksum !== checksum(encodedPoint)
        )
          return { kind: 'invalid', failure: invalidCursor() };

        const point = decodePoint(encodedPoint);
        if (point === null)
          return { kind: 'invalid', failure: invalidCursor() };
        if (!belongsTo(point, scope))
          return { kind: 'invalid', failure: scopeMismatch() };

        return {
          kind: 'valid',
          point: { dueAt: new Date(point.dueAt), orderId: point.orderId },
        };
      },
    });

export const productionOrderBacklogCursor =
  defineProductionOrderBacklogCursor();
