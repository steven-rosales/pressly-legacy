import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { productionOrderBacklogCursor } from '../../../../src/foundations/adapters/contracts/production-order-backlog-cursor/production-order-backlog-cursor.contract.mapper.ts';

const scope = {
  locationId: 'location-1',
  filter: 'all_due_before_cutoff',
  cutoff: '2026-07-01T00:00:00.000Z',
  reason: 'processor_not_in_use',
} as const;

const point = {
  dueAt: new Date('2026-06-01T00:00:00.000Z'),
  orderId: '00000000-0000-4000-8000-000000000002',
};

describe('production backlog cursor contract mapping', () => {
  it('preserves the established v1 bytes while delegating Base64URL mechanics', () => {
    const payload = {
      version: 1,
      locationId: scope.locationId,
      filter: scope.filter,
      cutoff: scope.cutoff,
      reason: scope.reason,
      dueAt: point.dueAt.toISOString(),
      orderId: point.orderId,
    };
    const legacyPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    const legacyChecksum = createHash('sha256')
      .update(`pressly:production-order-backlog-cursor:v1\0${legacyPayload}`)
      .digest('hex');

    expect(productionOrderBacklogCursor.encode(scope, point)).toBe(
      `${legacyPayload}.${legacyChecksum}`,
    );
  });

  it('keeps point validity separate from review-scope ownership', () => {
    const cursor = productionOrderBacklogCursor.encode(scope, point);

    expect(productionOrderBacklogCursor.decode(cursor, scope)).toEqual({
      tag: 'ok',
      value: point,
    });
    expect(
      productionOrderBacklogCursor.decode(cursor, {
        ...scope,
        reason: 'duplicate_or_test',
      }),
    ).toMatchObject({
      tag: 'err',
      error: {
        code: 'production_order_backlog_cursor_scope_mismatch',
      },
    });
  });
});
