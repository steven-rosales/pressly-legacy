import { describe, expect, it } from 'vitest';
import { orderManagementFailureToAppError } from '../../src/http/order-management/orders/order-management.error.ts';

describe('Order management failure boundary', () => {
  it.each([
    ['validation', 400],
    ['not_found', 404],
    ['conflict', 409],
  ] as const)('maps %s failures to HTTP %i', (kind, status) => {
    expect(
      orderManagementFailureToAppError({
        kind,
        code: `order_${kind}`,
        message: 'Expected Order failure.',
      }),
    ).toMatchObject({
      tag: 'AppError',
      code: `order_${kind}`,
      status,
    });
  });
});
