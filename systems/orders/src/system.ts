import type { PostgresDatabase } from '@pressly/postgres/client';
import type { OrderLocationFactsV1Capability } from '@pressly/access-system/capabilities/order-location-facts-v1';
import type { CustomerReferenceV1Capability } from '@pressly/customers-system/capabilities/customer-reference-v1';
import type { ResolveExactSourceCustomerV1Capability } from '@pressly/customers-system/capabilities/resolve-exact-source-customer-v1';
import { makeListRecentOrderAuditV1Capability } from './capabilities/list-recent-order-audit-v1.postgres.ts';
import { makeResolveCanonicalOrdersByFulfillmentV1Capability } from './capabilities/resolve-canonical-orders-by-fulfillment-v1.postgres.ts';
import { makeReleaseFulfillmentCell } from './cells/fulfillment/release-fulfillment/cell.ts';
import { makeWithdrawFulfillmentCell } from './cells/fulfillment/withdraw-fulfillment/cell.ts';
import { makeAcceptIncomingOrderProposalCell } from './cells/intake/accept-incoming-order-proposal/cell.ts';
import { makeCloseIncomingOrderSourceCell } from './cells/intake/close-incoming-order-source/cell.ts';
import { makeCloseIncomingOrderSourcePostgresRepository } from './cells/intake/close-incoming-order-source/postgres.ts';
import { makeProposeIncomingOrderCell } from './cells/intake/propose-incoming-order/cell.ts';
import { makeProposeIncomingOrderPostgresRepository } from './cells/intake/propose-incoming-order/postgres.ts';
import { makeListIncomingOrderProposalsCell } from './cells/intake/list-incoming-order-proposals/cell.ts';
import { makeRejectIncomingOrderProposalCell } from './cells/intake/reject-incoming-order-proposal/cell.ts';
import { makeRestoreIncomingOrderProposalCell } from './cells/intake/restore-incoming-order-proposal/cell.ts';
import { makeCancelOrderCell } from './cells/lifecycle/cancel-order/cell.ts';
import { makeCompleteOrderCell } from './cells/lifecycle/complete-order/cell.ts';
import { makeCorrectOrderCell } from './cells/lifecycle/correct-order/cell.ts';
import { makeCreateOrderCell } from './cells/lifecycle/create-order/cell.ts';
import { makeClaimOrderOutboxCell } from './cells/outbox/claim-order-outbox/cell.ts';
import { makeClaimOrderOutboxPostgresRepository } from './cells/outbox/claim-order-outbox/postgres.ts';
import { makeCompleteOrderOutboxCell } from './cells/outbox/complete-order-outbox/cell.ts';
import { makeCompleteOrderOutboxPostgresRepository } from './cells/outbox/complete-order-outbox/postgres.ts';
import { makeDeadLetterOrderOutboxCell } from './cells/outbox/dead-letter-order-outbox/cell.ts';
import { makeDeadLetterOrderOutboxPostgresRepository } from './cells/outbox/dead-letter-order-outbox/postgres.ts';
import { makeMeasureOrderOutboxBacklogCell } from './cells/outbox/measure-order-outbox-backlog/cell.ts';
import { makeMeasureOrderOutboxBacklogPostgresRepository } from './cells/outbox/measure-order-outbox-backlog/postgres.ts';
import { makeRetryOrderOutboxCell } from './cells/outbox/retry-order-outbox/cell.ts';
import { makeRetryOrderOutboxPostgresRepository } from './cells/outbox/retry-order-outbox/postgres.ts';
import { makeGetCanonicalOrderCell } from './cells/queries/get-canonical-order/cell.ts';
import { makeListCanonicalOrdersCell } from './cells/queries/list-canonical-orders/cell.ts';
import type { OrdersSchema } from './schema/orders.ts';

export type OrdersSystemClock = Readonly<{ now: () => Date }>;

export type OrdersIntegrationSystemDependencies = Readonly<{
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: OrdersSystemClock;
}>;

export type OrdersSystemDependencies = OrdersIntegrationSystemDependencies &
  Readonly<{
    customerReferenceV1: CustomerReferenceV1Capability;
    orderLocationFactsV1: OrderLocationFactsV1Capability;
    resolveExactSourceCustomerV1: ResolveExactSourceCustomerV1Capability;
  }>;

export const makeOrdersIntegrationSystem = (
  dependencies: OrdersIntegrationSystemDependencies,
) => {
  const proposeIncomingOrder = makeProposeIncomingOrderCell({
    repo: makeProposeIncomingOrderPostgresRepository(
      dependencies.db,
      dependencies.schema,
    ),
  });
  const closeIncomingOrderSource = makeCloseIncomingOrderSourceCell({
    repo: makeCloseIncomingOrderSourcePostgresRepository(
      dependencies.db,
      dependencies.schema,
    ),
    clock: dependencies.clock,
  });
  const measureOrderOutboxBacklog = makeMeasureOrderOutboxBacklogCell({
    repo: makeMeasureOrderOutboxBacklogPostgresRepository(
      dependencies.db,
      dependencies.schema,
    ),
    clock: dependencies.clock,
  });
  const claimOrderOutbox = makeClaimOrderOutboxCell({
    repo: makeClaimOrderOutboxPostgresRepository({
      db: dependencies.db,
      schema: dependencies.schema,
    }),
    clock: dependencies.clock,
  });
  const completeOrderOutbox = makeCompleteOrderOutboxCell({
    repo: makeCompleteOrderOutboxPostgresRepository(
      dependencies.db,
      dependencies.schema,
    ),
    clock: dependencies.clock,
  });
  const retryOrderOutbox = makeRetryOrderOutboxCell(
    makeRetryOrderOutboxPostgresRepository(
      dependencies.db,
      dependencies.schema,
    ),
  );
  const deadLetterOrderOutbox = makeDeadLetterOrderOutboxCell({
    repo: makeDeadLetterOrderOutboxPostgresRepository(
      dependencies.db,
      dependencies.schema,
    ),
    clock: dependencies.clock,
  });

  return Object.freeze({
    cells: Object.freeze({
      proposeIncomingOrder,
      closeIncomingOrderSource,
      measureOrderOutboxBacklog,
      claimOrderOutbox,
      completeOrderOutbox,
      retryOrderOutbox,
      deadLetterOrderOutbox,
    }),
  });
};

export type OrdersIntegrationSystem = ReturnType<
  typeof makeOrdersIntegrationSystem
>;

export const makeOrdersSystem = (dependencies: OrdersSystemDependencies) => {
  const integration = makeOrdersIntegrationSystem(dependencies);
  const listIncomingOrderProposals = makeListIncomingOrderProposalsCell(
    dependencies.db,
    dependencies.schema,
  );
  const acceptIncomingOrderProposal = makeAcceptIncomingOrderProposalCell({
    ...dependencies,
    resolveExactSourceCustomerV1: dependencies.resolveExactSourceCustomerV1,
  });
  const rejectIncomingOrderProposal =
    makeRejectIncomingOrderProposalCell(dependencies);
  const restoreIncomingOrderProposal =
    makeRestoreIncomingOrderProposalCell(dependencies);
  const createOrder = makeCreateOrderCell({
    ...dependencies,
    customerReferenceV1: dependencies.customerReferenceV1,
  });
  const correctOrder = makeCorrectOrderCell({
    ...dependencies,
    customerReferenceV1: dependencies.customerReferenceV1,
  });
  const completeOrder = makeCompleteOrderCell(dependencies);
  const cancelOrder = makeCancelOrderCell(dependencies);
  const releaseFulfillment = makeReleaseFulfillmentCell(dependencies);
  const withdrawFulfillment = makeWithdrawFulfillmentCell(dependencies);
  const getCanonicalOrder = makeGetCanonicalOrderCell({
    db: dependencies.db,
    schema: dependencies.schema,
  });
  const listCanonicalOrders = makeListCanonicalOrdersCell({
    db: dependencies.db,
    schema: dependencies.schema,
  });

  return Object.freeze({
    cells: Object.freeze({
      ...integration.cells,
      listIncomingOrderProposals,
      acceptIncomingOrderProposal,
      rejectIncomingOrderProposal,
      restoreIncomingOrderProposal,
      createOrder,
      correctOrder,
      completeOrder,
      cancelOrder,
      releaseFulfillment,
      withdrawFulfillment,
      getCanonicalOrder,
      listCanonicalOrders,
    }),
    capabilities: Object.freeze({
      listRecentOrderAuditV1: makeListRecentOrderAuditV1Capability(
        dependencies.db,
        dependencies.schema,
      ),
      resolveCanonicalOrdersByFulfillmentV1:
        makeResolveCanonicalOrdersByFulfillmentV1Capability({
          db: dependencies.db,
          schema: dependencies.schema,
        }),
    }),
  });
};

export type OrdersSystem = ReturnType<typeof makeOrdersSystem>;
