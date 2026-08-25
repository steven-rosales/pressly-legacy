import { createHash } from 'node:crypto';
import { encodeBase64UrlJson, type JsonObject } from '@pressly/codec';
import { productionOrderBacklogCursorSchema } from './contract.ts';
import { describe, expect, it } from 'vitest';
import { productionOrderBacklogCursor } from './cursor.ts';
import type { ProductionOrderBacklogScope } from './model.ts';

const scope = {
  locationId: 'location-1',
  filter: 'all_due_before_cutoff',
  cutoff: '2026-08-01T00:00:00.000Z',
  reason: 'processor_not_in_use',
} as const;
const point = {
  dueAt: new Date('2026-07-01T12:00:00.000Z'),
  orderId: '71000000-0000-4000-8000-000000000001',
};

const signed = (payload: JsonObject) => {
  const encoded = encodeBase64UrlJson(payload);
  const checksum = createHash('sha256')
    .update(`pressly:production-order-backlog-cursor:v1\0${encoded}`)
    .digest('hex');
  return productionOrderBacklogCursorSchema.parse(`${encoded}.${checksum}`);
};

describe('preview order backlog cursor', () => {
  it('preserves the established v1 bytes and exact dueAt/orderId point', () => {
    const payload = {
      version: 1,
      locationId: scope.locationId,
      filter: scope.filter,
      cutoff: scope.cutoff,
      reason: scope.reason,
      dueAt: point.dueAt.toISOString(),
      orderId: point.orderId,
    };
    const expected = signed(payload);

    expect(productionOrderBacklogCursor.encode(scope, point)).toBe(expected);
    expect(productionOrderBacklogCursor.decode(expected, scope)).toEqual({
      kind: 'valid',
      point,
    });
  });

  it('binds location, cutoff, and reason but deliberately excludes page size', () => {
    const cursor = productionOrderBacklogCursor.encode(scope, point);
    for (const changed of [
      { ...scope, locationId: 'location-2' },
      { ...scope, cutoff: '2026-08-02T00:00:00.000Z' },
      { ...scope, reason: 'duplicate_or_test' as const },
    ])
      expect(
        productionOrderBacklogCursor.decode(cursor, changed),
      ).toMatchObject({
        kind: 'invalid',
        failure: {
          code: 'production_order_backlog_cursor_scope_mismatch',
        },
      });

    const differentPageSize: ProductionOrderBacklogScope = {
      ...scope,
      cursor: null,
      maxOrders: 99,
    };
    expect(
      productionOrderBacklogCursor.decode(cursor, differentPageSize),
    ).toEqual({ kind: 'valid', point });
  });

  it('rejects checksum tampering and validly signed malformed points', () => {
    const cursor = productionOrderBacklogCursor.encode(scope, point);
    const tampered = productionOrderBacklogCursorSchema.parse(
      `${cursor.slice(0, -1)}${cursor.endsWith('a') ? 'b' : 'a'}`,
    );
    expect(productionOrderBacklogCursor.decode(tampered, scope)).toMatchObject({
      kind: 'invalid',
      failure: { code: 'production_order_backlog_cursor_invalid' },
    });

    const malformed = signed({
      version: 1,
      locationId: scope.locationId,
      filter: scope.filter,
      cutoff: scope.cutoff,
      reason: scope.reason,
      dueAt: '2026-07-01T12:00:00Z',
      orderId: 'not-a-production-id',
    });
    expect(productionOrderBacklogCursor.decode(malformed, scope)).toMatchObject(
      {
        kind: 'invalid',
        failure: { code: 'production_order_backlog_cursor_invalid' },
      },
    );
  });
});
