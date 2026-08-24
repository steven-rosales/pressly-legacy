import { describe, expect, it } from 'vitest';
import { acceptIncomingOrderProposalCellDeclaration } from './cells/intake/accept-incoming-order-proposal/cell.ts';
import { acceptIncomingOrderProposalContract } from './cells/intake/accept-incoming-order-proposal/contract.ts';
import type { AcceptIncomingOrderProposalCommand } from './cells/intake/accept-incoming-order-proposal/types.ts';
import { listIncomingOrderProposalsCellDeclaration } from './cells/intake/list-incoming-order-proposals/cell.ts';
import { listIncomingOrderProposalsContract } from './cells/intake/list-incoming-order-proposals/contract.ts';
import type { ListIncomingOrderProposalsQuery } from './cells/intake/list-incoming-order-proposals/types.ts';
import { rejectIncomingOrderProposalCellDeclaration } from './cells/intake/reject-incoming-order-proposal/cell.ts';
import { rejectIncomingOrderProposalContract } from './cells/intake/reject-incoming-order-proposal/contract.ts';
import type { RejectIncomingOrderProposalCommand } from './cells/intake/reject-incoming-order-proposal/types.ts';
import { restoreIncomingOrderProposalCellDeclaration } from './cells/intake/restore-incoming-order-proposal/cell.ts';
import { restoreIncomingOrderProposalContract } from './cells/intake/restore-incoming-order-proposal/contract.ts';
import type { RestoreIncomingOrderProposalCommand } from './cells/intake/restore-incoming-order-proposal/types.ts';
import { releaseFulfillmentCellDeclaration } from './cells/fulfillment/release-fulfillment/cell.ts';
import { releaseFulfillmentContract } from './cells/fulfillment/release-fulfillment/contract.ts';
import type { ReleaseFulfillmentCommand } from './cells/fulfillment/release-fulfillment/types.ts';
import { withdrawFulfillmentCellDeclaration } from './cells/fulfillment/withdraw-fulfillment/cell.ts';
import { withdrawFulfillmentContract } from './cells/fulfillment/withdraw-fulfillment/contract.ts';
import type { WithdrawFulfillmentCommand } from './cells/fulfillment/withdraw-fulfillment/types.ts';
import { cancelOrderCellDeclaration } from './cells/lifecycle/cancel-order/cell.ts';
import { cancelOrderContract } from './cells/lifecycle/cancel-order/contract.ts';
import type { CancelOrderCommand } from './cells/lifecycle/cancel-order/types.ts';
import { completeOrderCellDeclaration } from './cells/lifecycle/complete-order/cell.ts';
import { completeOrderContract } from './cells/lifecycle/complete-order/contract.ts';
import type { CompleteOrderCommand } from './cells/lifecycle/complete-order/types.ts';
import { correctOrderCellDeclaration } from './cells/lifecycle/correct-order/cell.ts';
import { correctOrderContract } from './cells/lifecycle/correct-order/contract.ts';
import type { CorrectOrderCommand } from './cells/lifecycle/correct-order/types.ts';
import { createOrderCellDeclaration } from './cells/lifecycle/create-order/cell.ts';
import { createOrderContract } from './cells/lifecycle/create-order/contract.ts';
import type { CreateOrderCommand } from './cells/lifecycle/create-order/types.ts';
import { getCanonicalOrderCellDeclaration } from './cells/queries/get-canonical-order/cell.ts';
import { getCanonicalOrderContract } from './cells/queries/get-canonical-order/contract.ts';
import type { GetCanonicalOrderQuery } from './cells/queries/get-canonical-order/types.ts';
import { listCanonicalOrdersCellDeclaration } from './cells/queries/list-canonical-orders/cell.ts';
import { listCanonicalOrdersContract } from './cells/queries/list-canonical-orders/contract.ts';
import type { ListCanonicalOrdersQuery } from './cells/queries/list-canonical-orders/types.ts';

const context = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human' as const, id: 'identity-1' },
};
const order = {
  customer: {
    resolution: 'not_provided' as const,
    userId: null,
    externalUserId: null,
  },
  displayNumber: 'P-100',
  dueAt: new Date('2026-08-23T20:00:00.000Z'),
  currency: 'USD',
  totalAmountCents: 3_600,
  balanceDueCents: 3_600,
  items: [
    {
      lineKey: 'laundry',
      itemType: 'service',
      code: 'wash_fold',
      description: 'Wash and fold',
      quantity: 18,
      unit: 'lb',
      unitPriceCents: 200,
      totalAmountCents: 3_600,
      sourceMetadata: { service: 'wash_fold' },
    },
  ],
  fulfillment: {
    typeCode: 'wash_fold',
    locationId: 'east',
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
  },
};
const audited = {
  businessId: 'business-1',
  idempotencyKey: 'command-1',
  context,
  reasonNote: null,
};
const proposal = {
  proposalId: 'proposal-1',
  locationId: 'east',
  expectedVersion: 1,
  idempotencyKey: 'proposal-command-1',
  context,
  reasonNote: null,
};

const createCommand: CreateOrderCommand = {
  ...order,
  ...audited,
  reasonCode: 'new_customer_order',
};
const correctCommand: CorrectOrderCommand = {
  ...audited,
  locationId: 'east',
  orderId: 'order-1',
  expectedOrderVersion: 1,
  expectedFulfillmentVersion: 1,
  changes: { displayNumber: 'P-101' },
  reasonCode: 'customer_correction',
};
const completeCommand: CompleteOrderCommand = {
  ...audited,
  locationId: 'east',
  orderId: 'order-1',
  expectedVersion: 1,
  reasonCode: 'service_completed',
};
const cancelCommand: CancelOrderCommand = {
  ...audited,
  locationId: 'east',
  orderId: 'order-1',
  expectedVersion: 1,
  reasonCode: 'customer_canceled',
};
const releaseCommand: ReleaseFulfillmentCommand = {
  ...audited,
  fulfillmentId: 'fulfillment-1',
  locationId: 'east',
  expectedOrderVersion: 1,
  expectedFulfillmentVersion: 1,
  reasonCode: 'ready_for_production',
};
const withdrawCommand: WithdrawFulfillmentCommand = {
  ...audited,
  fulfillmentId: 'fulfillment-1',
  locationId: 'east',
  expectedOrderVersion: 1,
  expectedFulfillmentVersion: 1,
  reasonCode: 'commercial_canceled',
};
const acceptCommand: AcceptIncomingOrderProposalCommand = {
  ...proposal,
  reasonCode: 'incoming_order_accepted',
};
const rejectCommand: RejectIncomingOrderProposalCommand = {
  ...proposal,
  reasonCode: 'duplicate_order',
};
const restoreCommand: RestoreIncomingOrderProposalCommand = {
  ...proposal,
  reasonCode: 'source_closure_overridden',
};
const listIncomingQuery: ListIncomingOrderProposalsQuery = {
  locationId: 'east',
  limit: 25,
  cursor: null,
  view: 'needs_review',
};
const getQuery: GetCanonicalOrderQuery = {
  businessId: 'business-1',
  locationIds: ['east'],
  orderId: 'order-1',
};
const listQuery: ListCanonicalOrdersQuery = {
  businessId: 'business-1',
  locationIds: ['east'],
  query: null,
  state: null,
  limit: 25,
  cursor: null,
};

const contracts = [
  [createOrderContract, createCommand],
  [correctOrderContract, correctCommand],
  [completeOrderContract, completeCommand],
  [cancelOrderContract, cancelCommand],
  [releaseFulfillmentContract, releaseCommand],
  [withdrawFulfillmentContract, withdrawCommand],
  [acceptIncomingOrderProposalContract, acceptCommand],
  [rejectIncomingOrderProposalContract, rejectCommand],
  [restoreIncomingOrderProposalContract, restoreCommand],
  [listIncomingOrderProposalsContract, listIncomingQuery],
  [getCanonicalOrderContract, getQuery],
  [listCanonicalOrdersContract, listQuery],
] as const;

const declarations = [
  createOrderCellDeclaration,
  correctOrderCellDeclaration,
  completeOrderCellDeclaration,
  cancelOrderCellDeclaration,
  releaseFulfillmentCellDeclaration,
  withdrawFulfillmentCellDeclaration,
  acceptIncomingOrderProposalCellDeclaration,
  rejectIncomingOrderProposalCellDeclaration,
  restoreIncomingOrderProposalCellDeclaration,
  listIncomingOrderProposalsCellDeclaration,
  getCanonicalOrderCellDeclaration,
  listCanonicalOrdersCellDeclaration,
] as const;

describe('Orders cell public contracts', () => {
  it('round-trips all twelve version-one inputs and rejects unknown fields', () => {
    for (const [contract, value] of contracts) {
      const encoded = contract.input.encode(value as never);
      expect(contract.input.decode(encoded)).toMatchObject({ kind: 'valid' });
      expect(
        contract.input.decode({
          ...(encoded as Record<string, unknown>),
          undeclared: true,
        }),
      ).toMatchObject({ kind: 'invalid' });
    }
  });

  it('declares twelve unique operation identities', () => {
    expect(new Set(declarations.map((cell) => cell.id)).size).toBe(12);
    expect(declarations.map((cell) => cell.id)).toEqual([
      'orders.create-order.v1',
      'orders.correct-order.v1',
      'orders.complete-order.v1',
      'orders.cancel-order.v1',
      'orders.release-fulfillment.v1',
      'orders.withdraw-fulfillment.v1',
      'orders.accept-incoming-order-proposal.v1',
      'orders.reject-incoming-order-proposal.v1',
      'orders.restore-incoming-order-proposal.v1',
      'orders.list-incoming-order-proposals.v1',
      'orders.get-canonical-order.v1',
      'orders.list-canonical-orders.v1',
    ]);
    expect(
      declarations.slice(0, 10).every((cell) => cell.surfaces.length === 1),
    ).toBe(true);
    expect(
      declarations.slice(10).every((cell) => cell.surfaces.length === 0),
    ).toBe(true);
  });

  it('keeps writes transactional and read declarations exact', () => {
    expect(
      declarations
        .slice(0, 9)
        .every(
          (cell) =>
            cell.kind === 'command' &&
            cell.authentication === 'required' &&
            cell.authorization?.capability === 'orders:manage' &&
            cell.authorization.timing === 'before-input' &&
            cell.consistency.transaction === 'required' &&
            cell.idempotency.required,
        ),
    ).toBe(true);
    expect(listIncomingOrderProposalsCellDeclaration.consistency).toMatchObject(
      { transaction: 'none', concurrency: 'none' },
    );
    expect(
      listIncomingOrderProposalsCellDeclaration.authorization,
    ).toMatchObject({ capability: 'orders:manage', timing: 'after-input' });
    for (const cell of [
      getCanonicalOrderCellDeclaration,
      listCanonicalOrdersCellDeclaration,
    ])
      expect(cell.consistency).toMatchObject({
        transaction: 'required',
        concurrency: 'none',
      });
  });
});
