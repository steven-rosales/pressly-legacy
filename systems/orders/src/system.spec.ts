import type { PostgresDatabase } from '@pressly/postgres/client';
import { describe, expect, it } from 'vitest';
import { acceptIncomingOrderProposalCellDeclaration } from './cells/intake/accept-incoming-order-proposal/cell.ts';
import { closeIncomingOrderSourceCellDeclaration } from './cells/intake/close-incoming-order-source/cell.ts';
import { proposeIncomingOrderCellDeclaration } from './cells/intake/propose-incoming-order/cell.ts';
import { listIncomingOrderProposalsCellDeclaration } from './cells/intake/list-incoming-order-proposals/cell.ts';
import { rejectIncomingOrderProposalCellDeclaration } from './cells/intake/reject-incoming-order-proposal/cell.ts';
import { restoreIncomingOrderProposalCellDeclaration } from './cells/intake/restore-incoming-order-proposal/cell.ts';
import { cancelOrderCellDeclaration } from './cells/lifecycle/cancel-order/cell.ts';
import { completeOrderCellDeclaration } from './cells/lifecycle/complete-order/cell.ts';
import { correctOrderCellDeclaration } from './cells/lifecycle/correct-order/cell.ts';
import { createOrderCellDeclaration } from './cells/lifecycle/create-order/cell.ts';
import { releaseFulfillmentCellDeclaration } from './cells/fulfillment/release-fulfillment/cell.ts';
import { withdrawFulfillmentCellDeclaration } from './cells/fulfillment/withdraw-fulfillment/cell.ts';
import { claimOrderOutboxCellDeclaration } from './cells/outbox/claim-order-outbox/cell.ts';
import { completeOrderOutboxCellDeclaration } from './cells/outbox/complete-order-outbox/cell.ts';
import { deadLetterOrderOutboxCellDeclaration } from './cells/outbox/dead-letter-order-outbox/cell.ts';
import { measureOrderOutboxBacklogCellDeclaration } from './cells/outbox/measure-order-outbox-backlog/cell.ts';
import { retryOrderOutboxCellDeclaration } from './cells/outbox/retry-order-outbox/cell.ts';
import { getCanonicalOrderCellDeclaration } from './cells/queries/get-canonical-order/cell.ts';
import { listCanonicalOrdersCellDeclaration } from './cells/queries/list-canonical-orders/cell.ts';
import { fulfillmentDemandChangedV2MessageContract } from './contracts/fulfillment-demand-changed-v2.ts';
import { makeOrdersIntegrationSystem, makeOrdersSystem } from './system.ts';
import { ordersTestSchema } from './testing/schema.ts';

const integrationCellDeclarations = {
  proposeIncomingOrder: proposeIncomingOrderCellDeclaration,
  closeIncomingOrderSource: closeIncomingOrderSourceCellDeclaration,
  measureOrderOutboxBacklog: measureOrderOutboxBacklogCellDeclaration,
  claimOrderOutbox: claimOrderOutboxCellDeclaration,
  completeOrderOutbox: completeOrderOutboxCellDeclaration,
  retryOrderOutbox: retryOrderOutboxCellDeclaration,
  deadLetterOrderOutbox: deadLetterOrderOutboxCellDeclaration,
} as const;

describe('Orders system owner assembly', () => {
  it('owns exactly seven Customer-independent integration cells', () => {
    const integration = makeOrdersIntegrationSystem({
      db: {} as PostgresDatabase,
      schema: ordersTestSchema,
      clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
    });
    expect(Object.keys(integration.cells)).toEqual([
      'proposeIncomingOrder',
      'closeIncomingOrderSource',
      'measureOrderOutboxBacklog',
      'claimOrderOutbox',
      'completeOrderOutbox',
      'retryOrderOutbox',
      'deadLetterOrderOutbox',
    ]);
  });

  it('assembles all nineteen selected operations', () => {
    const system = makeOrdersSystem({
      db: {} as PostgresDatabase,
      schema: ordersTestSchema,
      clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
      customerReferenceV1: {} as never,
      orderLocationFactsV1: {} as never,
      resolveExactSourceCustomerV1: {} as never,
    });

    expect(Object.keys(system.cells)).toEqual([
      'proposeIncomingOrder',
      'closeIncomingOrderSource',
      'measureOrderOutboxBacklog',
      'claimOrderOutbox',
      'completeOrderOutbox',
      'retryOrderOutbox',
      'deadLetterOrderOutbox',
      'listIncomingOrderProposals',
      'acceptIncomingOrderProposal',
      'rejectIncomingOrderProposal',
      'restoreIncomingOrderProposal',
      'createOrder',
      'correctOrder',
      'completeOrder',
      'cancelOrder',
      'releaseFulfillment',
      'withdrawFulfillment',
      'getCanonicalOrder',
      'listCanonicalOrders',
    ]);
    expect(system.cells.proposeIncomingOrder.contract).toBe(
      proposeIncomingOrderCellDeclaration.contract,
    );
    expect(system.cells.closeIncomingOrderSource.contract).toBe(
      closeIncomingOrderSourceCellDeclaration.contract,
    );
    expect(system.cells.measureOrderOutboxBacklog.contract).toBe(
      measureOrderOutboxBacklogCellDeclaration.contract,
    );
    expect(system.cells.claimOrderOutbox.contract).toBe(
      claimOrderOutboxCellDeclaration.contract,
    );
    expect(system.cells.completeOrderOutbox.contract).toBe(
      completeOrderOutboxCellDeclaration.contract,
    );
    expect(system.cells.retryOrderOutbox.contract).toBe(
      retryOrderOutboxCellDeclaration.contract,
    );
    expect(system.cells.deadLetterOrderOutbox.contract).toBe(
      deadLetterOrderOutboxCellDeclaration.contract,
    );
    const selectedCells = {
      listIncomingOrderProposals: listIncomingOrderProposalsCellDeclaration,
      acceptIncomingOrderProposal: acceptIncomingOrderProposalCellDeclaration,
      rejectIncomingOrderProposal: rejectIncomingOrderProposalCellDeclaration,
      restoreIncomingOrderProposal: restoreIncomingOrderProposalCellDeclaration,
      createOrder: createOrderCellDeclaration,
      correctOrder: correctOrderCellDeclaration,
      completeOrder: completeOrderCellDeclaration,
      cancelOrder: cancelOrderCellDeclaration,
      releaseFulfillment: releaseFulfillmentCellDeclaration,
      withdrawFulfillment: withdrawFulfillmentCellDeclaration,
      getCanonicalOrder: getCanonicalOrderCellDeclaration,
      listCanonicalOrders: listCanonicalOrdersCellDeclaration,
    } as const;
    for (const [name, declaration] of Object.entries(selectedCells))
      expect(system.cells[name as keyof typeof system.cells].contract).toBe(
        declaration.contract,
      );
    expect(
      Object.values(integrationCellDeclarations).every(
        (cell) => cell.surfaces.length === 0,
      ),
    ).toBe(true);
    expect(
      Object.values(selectedCells)
        .filter(
          (cell) =>
            cell !== getCanonicalOrderCellDeclaration &&
            cell !== listCanonicalOrdersCellDeclaration,
        )
        .every((cell) => cell.surfaces.length === 1),
    ).toBe(true);
    expect(getCanonicalOrderCellDeclaration.surfaces).toEqual([]);
    expect(listCanonicalOrdersCellDeclaration.surfaces).toEqual([]);
  });

  it('declares the selected transaction and concurrency boundary', () => {
    for (const cell of [
      createOrderCellDeclaration,
      correctOrderCellDeclaration,
      completeOrderCellDeclaration,
      cancelOrderCellDeclaration,
      releaseFulfillmentCellDeclaration,
      withdrawFulfillmentCellDeclaration,
      acceptIncomingOrderProposalCellDeclaration,
      rejectIncomingOrderProposalCellDeclaration,
      restoreIncomingOrderProposalCellDeclaration,
    ]) {
      expect(cell.kind).toBe('command');
      expect(cell.consistency.transaction).toBe('required');
      expect(cell.idempotency.required).toBe(true);
      expect(cell.authentication).toBe('required');
      expect(cell.authorization).toMatchObject({
        capability: 'orders:manage',
        timing: 'before-input',
      });
      expect(cell.surfaces).toHaveLength(1);
    }
    expect(listIncomingOrderProposalsCellDeclaration.consistency).toMatchObject(
      { transaction: 'none', concurrency: 'none' },
    );
    expect(
      listIncomingOrderProposalsCellDeclaration.authorization,
    ).toMatchObject({ capability: 'orders:manage', timing: 'after-input' });
    expect(listIncomingOrderProposalsCellDeclaration.surfaces).toHaveLength(1);
    for (const cell of [
      getCanonicalOrderCellDeclaration,
      listCanonicalOrdersCellDeclaration,
    ])
      expect(cell.consistency).toMatchObject({
        transaction: 'required',
        concurrency: 'none',
      });
  });

  it('publishes but does not yet emit the producer-owned external message', () => {
    expect(fulfillmentDemandChangedV2MessageContract).toMatchObject({
      id: 'fulfillment_demand_changed.v2',
      scope: 'external',
    });
    expect(
      Object.values({
        measureOrderOutboxBacklog: measureOrderOutboxBacklogCellDeclaration,
        claimOrderOutbox: claimOrderOutboxCellDeclaration,
        completeOrderOutbox: completeOrderOutboxCellDeclaration,
        retryOrderOutbox: retryOrderOutboxCellDeclaration,
        deadLetterOrderOutbox: deadLetterOrderOutboxCellDeclaration,
      }).every((cell) => cell.emits.length === 0 && cell.consumes.length === 0),
    ).toBe(true);
  });

  it('declares read versus write behavior and exact lease-fence concurrency', () => {
    expect(measureOrderOutboxBacklogCellDeclaration).toMatchObject({
      kind: 'query',
      consistency: { transaction: 'none', concurrency: 'none' },
    });
    expect(claimOrderOutboxCellDeclaration).toMatchObject({
      kind: 'command',
      consistency: { transaction: 'required', concurrency: 'none' },
    });
    for (const cell of [
      completeOrderOutboxCellDeclaration,
      retryOrderOutboxCellDeclaration,
      deadLetterOrderOutboxCellDeclaration,
    ]) {
      expect(cell.consistency).toMatchObject({
        transaction: 'required',
        concurrency: 'optimistic',
      });
      expect(cell.consistency.expectedVersion).toBeUndefined();
    }
  });
});
