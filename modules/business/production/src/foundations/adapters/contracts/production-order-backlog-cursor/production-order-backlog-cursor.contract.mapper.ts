import {
  decodeBase64UrlJson,
  encodeBase64UrlJson,
  isJsonObject,
  type JsonObject,
} from '@pressly/codec';
import { sha256Text } from '@pressly/codec/node';
import { productionIdSchema } from '@pressly/contracts/production';
import { result } from '@pressly/kernel';
import type { ProductionOrderBacklogCursorFailure } from '../../../language/production-order-backlog/production-order-backlog.failure.ts';
import type {
  ProductionOrderBacklogScope,
  ProductionOrderBacklogSnapshotOrder,
} from '../../../language/production-order-backlog/production-order-backlog.model.ts';
import type { ProductionOrderBacklogCursorCodec } from '../../../ports/production-order-backlog-cursor/production-order-backlog-cursor.port.ts';

type BacklogCursorScope = Pick<
  ProductionOrderBacklogScope,
  'locationId' | 'filter' | 'cutoff' | 'reason'
>;

type BacklogCursorPoint = BacklogCursorScope &
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

const isBacklogFilter = (
  value: unknown,
): value is BacklogCursorScope['filter'] => value === 'all_due_before_cutoff';

const isBacklogReason = (
  value: unknown,
): value is BacklogCursorScope['reason'] =>
  value === 'completed_outside_pressly' ||
  value === 'processor_not_in_use' ||
  value === 'duplicate_or_test' ||
  value === 'order_will_not_be_produced' ||
  value === 'other';

const decodePoint = (encodedPoint: string): BacklogCursorPoint | null => {
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
    !isBacklogFilter(filter) ||
    !isCanonicalInstant(cutoff) ||
    !isBacklogReason(reason) ||
    !isCanonicalInstant(dueAt) ||
    typeof orderId !== 'string' ||
    !productionIdSchema.safeParse(orderId).success
  )
    return null;

  return { version, locationId, filter, cutoff, reason, dueAt, orderId };
};

const checksum = (encodedPoint: string): string =>
  sha256Text(`pressly:production-order-backlog-cursor:v1\0${encodedPoint}`);

const sameScope = (
  point: BacklogCursorPoint,
  scope: BacklogCursorScope,
): boolean =>
  point.locationId === scope.locationId &&
  point.filter === scope.filter &&
  point.cutoff === scope.cutoff &&
  point.reason === scope.reason;

export const defineProductionOrderBacklogCursor =
  (): ProductionOrderBacklogCursorCodec =>
    Object.freeze({
      encode: (
        scope: BacklogCursorScope,
        order: Pick<ProductionOrderBacklogSnapshotOrder, 'dueAt' | 'orderId'>,
      ) => {
        const point: JsonObject = {
          version: 1,
          locationId: scope.locationId,
          filter: scope.filter,
          cutoff: scope.cutoff,
          reason: scope.reason,
          dueAt: order.dueAt.toISOString(),
          orderId: order.orderId,
        };
        const encodedPoint = encodeBase64UrlJson(point);
        return `${encodedPoint}.${checksum(encodedPoint)}`;
      },

      decode: (cursor, scope) => {
        if (cursor === null) return result.ok(null);

        const parts = cursor.split('.');
        const encodedPoint = parts[0];
        const suppliedChecksum = parts[1];
        if (
          parts.length !== 2 ||
          encodedPoint === undefined ||
          suppliedChecksum === undefined ||
          suppliedChecksum !== checksum(encodedPoint)
        )
          return result.err(invalidCursor());

        const point = decodePoint(encodedPoint);
        if (point === null) return result.err(invalidCursor());
        if (!sameScope(point, scope)) return result.err(scopeMismatch());

        return result.ok({
          dueAt: new Date(point.dueAt),
          orderId: point.orderId,
        });
      },
    });

export const productionOrderBacklogCursor =
  defineProductionOrderBacklogCursor();
