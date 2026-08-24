import { acceptIncomingOrderProposalCellDeclaration } from '@pressly/orders-system/operations/intake/accept-incoming-order-proposal/cell';
import { listIncomingOrderProposalsCellDeclaration } from '@pressly/orders-system/operations/intake/list-incoming-order-proposals/cell';
import { rejectIncomingOrderProposalCellDeclaration } from '@pressly/orders-system/operations/intake/reject-incoming-order-proposal/cell';
import { restoreIncomingOrderProposalCellDeclaration } from '@pressly/orders-system/operations/intake/restore-incoming-order-proposal/cell';
import { cancelOrderCellDeclaration } from '@pressly/orders-system/operations/lifecycle/cancel-order/cell';
import { completeOrderCellDeclaration } from '@pressly/orders-system/operations/lifecycle/complete-order/cell';
import { correctOrderCellDeclaration } from '@pressly/orders-system/operations/lifecycle/correct-order/cell';
import { createOrderCellDeclaration } from '@pressly/orders-system/operations/lifecycle/create-order/cell';
import { releaseFulfillmentCellDeclaration } from '@pressly/orders-system/operations/fulfillment/release-fulfillment/cell';
import { withdrawFulfillmentCellDeclaration } from '@pressly/orders-system/operations/fulfillment/withdraw-fulfillment/cell';
import { getCanonicalOrderCellDeclaration } from '@pressly/orders-system/operations/queries/get-canonical-order/cell';
import { listCanonicalOrdersCellDeclaration } from '@pressly/orders-system/operations/queries/list-canonical-orders/cell';
import { describe, expect, it } from 'vitest';
import {
  normalizeOrdersOutcome,
  ordersVerificationSurface,
} from '../src/public.ts';

const declarations = [
  listIncomingOrderProposalsCellDeclaration,
  acceptIncomingOrderProposalCellDeclaration,
  rejectIncomingOrderProposalCellDeclaration,
  restoreIncomingOrderProposalCellDeclaration,
  createOrderCellDeclaration,
  correctOrderCellDeclaration,
  completeOrderCellDeclaration,
  cancelOrderCellDeclaration,
  releaseFulfillmentCellDeclaration,
  withdrawFulfillmentCellDeclaration,
  getCanonicalOrderCellDeclaration,
  listCanonicalOrdersCellDeclaration,
] as const;

describe('Orders verification surface', () => {
  it('publishes exactly twelve distinct selected target operations', () => {
    expect(ordersVerificationSurface.id).toBe('orders.remaining-operations.v1');
    expect(new Set(declarations.map((cell) => cell.id)).size).toBe(12);
    expect(
      declarations.slice(0, 10).every((cell) => cell.surfaces.length === 1),
    ).toBe(true);
    expect(
      declarations.slice(10).every((cell) => cell.surfaces.length === 0),
    ).toBe(true);
  });

  it('normalizes target outcomes into a deterministic proof shape', () => {
    const value = {
      orderId: '75000000-0000-4000-8000-000000000001',
      version: 2,
      replayed: false,
    };
    expect(normalizeOrdersOutcome({ kind: 'success', value })).toEqual({
      kind: 'success',
      value: { orderId: '<uuid>', version: 2, replayed: false },
    });
    const failure = {
      kind: 'conflict',
      code: 'order_version_conflict',
      message: 'Conflict.',
    };
    expect(normalizeOrdersOutcome({ kind: 'failure', failure })).toEqual({
      kind: 'failure',
      failure,
    });
  });
});
