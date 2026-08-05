import type { Database } from '@pressly/db/client';
import type { Clock } from '@pressly/time';
import { makeCancelOrder } from '../features/lifecycle/cancel-order/cancel-order.usecase.ts';
import { makeCompleteOrder } from '../features/lifecycle/complete-order/complete-order.usecase.ts';
import { makeReleaseFulfillment } from '../features/fulfillment/release-fulfillment/release-fulfillment.usecase.ts';
import { makeWithdrawFulfillment } from '../features/fulfillment/withdraw-fulfillment/withdraw-fulfillment.usecase.ts';
import { makePostgresOrderLifecycleTransaction } from '../foundations/adapters/postgres/order-lifecycle-transaction/order-lifecycle-transaction.repo.ts';
import { makePostgresFulfillmentReleaseTransaction } from '../foundations/adapters/postgres/fulfillment-release-transaction/fulfillment-release-transaction.repo.ts';
import { makePostgresClaimOrderOutboxRepository } from '../features/outbox/claim-order-outbox/claim-order-outbox.repo.ts';
import { makeClaimOrderOutbox } from '../features/outbox/claim-order-outbox/claim-order-outbox.usecase.ts';
import { makePostgresCompleteOrderOutboxRepository } from '../features/outbox/complete-order-outbox/complete-order-outbox.repo.ts';
import { makeCompleteOrderOutbox } from '../features/outbox/complete-order-outbox/complete-order-outbox.usecase.ts';
import { makePostgresCorrectOrderRepository } from '../features/lifecycle/correct-order/correct-order.repo.ts';
import { makeCorrectOrder } from '../features/lifecycle/correct-order/correct-order.usecase.ts';
import { makePostgresCreateOrderRepository } from '../features/lifecycle/create-order/create-order.repo.ts';
import { makeCreateOrder } from '../features/lifecycle/create-order/create-order.usecase.ts';
import { makePostgresDeadLetterOrderOutboxRepository } from '../features/outbox/dead-letter-order-outbox/dead-letter-order-outbox.repo.ts';
import { makeDeadLetterOrderOutbox } from '../features/outbox/dead-letter-order-outbox/dead-letter-order-outbox.usecase.ts';
import { makePostgresAcceptIncomingOrderProposalRepository } from '../features/intake/accept-incoming-order-proposal/accept-incoming-order-proposal.repo.ts';
import type { IncomingOrderProposalCustomerPersistence } from '../features/intake/accept-incoming-order-proposal/accept-incoming-order-proposal.repo.ts';
import { makeAcceptIncomingOrderProposal } from '../features/intake/accept-incoming-order-proposal/accept-incoming-order-proposal.usecase.ts';
import { makePostgresCloseIncomingOrderSourceRepository } from '../features/intake/close-incoming-order-source/close-incoming-order-source.repo.ts';
import { makeCloseIncomingOrderSource } from '../features/intake/close-incoming-order-source/close-incoming-order-source.usecase.ts';
import { makePostgresListIncomingOrderProposalsRepository } from '../features/intake/list-incoming-order-proposals/list-incoming-order-proposals.repo.ts';
import { makeListIncomingOrderProposals } from '../features/intake/list-incoming-order-proposals/list-incoming-order-proposals.usecase.ts';
import { makePostgresProposeIncomingOrderRepository } from '../features/intake/propose-incoming-order/propose-incoming-order.repo.ts';
import { makeProposeIncomingOrder } from '../features/intake/propose-incoming-order/propose-incoming-order.usecase.ts';
import { makePostgresRejectIncomingOrderProposalRepository } from '../features/intake/reject-incoming-order-proposal/reject-incoming-order-proposal.repo.ts';
import { makeRejectIncomingOrderProposal } from '../features/intake/reject-incoming-order-proposal/reject-incoming-order-proposal.usecase.ts';
import { makePostgresRestoreIncomingOrderProposalRepository } from '../features/intake/restore-incoming-order-proposal/restore-incoming-order-proposal.repo.ts';
import { makeRestoreIncomingOrderProposal } from '../features/intake/restore-incoming-order-proposal/restore-incoming-order-proposal.usecase.ts';
import { makePostgresRetryOrderOutboxRepository } from '../features/outbox/retry-order-outbox/retry-order-outbox.repo.ts';
import { makeRetryOrderOutbox } from '../features/outbox/retry-order-outbox/retry-order-outbox.usecase.ts';
import { makePostgresGetCanonicalOrderRepository } from '../features/queries/get-canonical-order/get-canonical-order.repo.ts';
import { makeGetCanonicalOrder } from '../features/queries/get-canonical-order/get-canonical-order.usecase.ts';
import { makePostgresListCanonicalOrdersRepository } from '../features/queries/list-canonical-orders/list-canonical-orders.repo.ts';
import { makeListCanonicalOrders } from '../features/queries/list-canonical-orders/list-canonical-orders.usecase.ts';

export type OrdersApplicationDeps = Readonly<{
  db: Database;
  clock: Clock;
  incomingOrderProposalCustomer: IncomingOrderProposalCustomerPersistence;
}>;

type OrdersPersistenceDeps = Readonly<{
  db: Database;
  clock: Clock;
}>;

const makePostgresOrderOutboxApplication = (deps: OrdersPersistenceDeps) => {
  const claimRepo = makePostgresClaimOrderOutboxRepository(deps.db);
  const completeRepo = makePostgresCompleteOrderOutboxRepository(deps.db);
  const retryRepo = makePostgresRetryOrderOutboxRepository(deps.db);
  const deadLetterRepo = makePostgresDeadLetterOrderOutboxRepository(deps.db);

  return {
    claimOutbox: makeClaimOrderOutbox({
      repo: claimRepo,
      clock: deps.clock,
    }),
    completeOutbox: makeCompleteOrderOutbox({
      repo: completeRepo,
      clock: deps.clock,
    }),
    retryOutbox: makeRetryOrderOutbox(retryRepo),
    deadLetterOutbox: makeDeadLetterOrderOutbox({
      repo: deadLetterRepo,
      clock: deps.clock,
    }),
  };
};

export const makePostgresOrdersApplication = (deps: OrdersApplicationDeps) => {
  const createRepo = makePostgresCreateOrderRepository(deps.db);
  const correctRepo = makePostgresCorrectOrderRepository(deps.db);
  const lifecycleRepo = makePostgresOrderLifecycleTransaction(deps.db);
  const proposeIncomingOrderRepo = makePostgresProposeIncomingOrderRepository(
    deps.db,
  );
  const listIncomingOrderProposalsRepo =
    makePostgresListIncomingOrderProposalsRepository(deps.db);
  const acceptIncomingOrderProposalRepo =
    makePostgresAcceptIncomingOrderProposalRepository(
      deps.db,
      deps.incomingOrderProposalCustomer,
    );
  const rejectIncomingOrderProposalRepo =
    makePostgresRejectIncomingOrderProposalRepository(deps.db);
  const restoreIncomingOrderProposalRepo =
    makePostgresRestoreIncomingOrderProposalRepository(deps.db);
  const releaseRepo = makePostgresFulfillmentReleaseTransaction(deps.db);

  return {
    proposeIncomingOrder: makeProposeIncomingOrder(proposeIncomingOrderRepo),
    listIncomingOrderProposals: makeListIncomingOrderProposals(
      listIncomingOrderProposalsRepo,
    ),
    acceptIncomingOrderProposal: makeAcceptIncomingOrderProposal({
      repo: acceptIncomingOrderProposalRepo,
      clock: deps.clock,
    }),
    rejectIncomingOrderProposal: makeRejectIncomingOrderProposal({
      repo: rejectIncomingOrderProposalRepo,
      clock: deps.clock,
    }),
    restoreIncomingOrderProposal: makeRestoreIncomingOrderProposal({
      repo: restoreIncomingOrderProposalRepo,
      clock: deps.clock,
    }),
    createOrder: makeCreateOrder({ repo: createRepo, clock: deps.clock }),
    correctOrder: makeCorrectOrder({ repo: correctRepo, clock: deps.clock }),
    completeOrder: makeCompleteOrder({
      repo: lifecycleRepo,
      clock: deps.clock,
    }),
    cancelOrder: makeCancelOrder({
      repo: lifecycleRepo,
      clock: deps.clock,
    }),
    releaseFulfillment: makeReleaseFulfillment({
      repo: releaseRepo,
      clock: deps.clock,
    }),
    withdrawFulfillment: makeWithdrawFulfillment({
      repo: releaseRepo,
      clock: deps.clock,
    }),
    listCanonicalOrders: makeListCanonicalOrders(
      makePostgresListCanonicalOrdersRepository(deps.db),
    ),
    getCanonicalOrder: makeGetCanonicalOrder(
      makePostgresGetCanonicalOrderRepository(deps.db),
    ),
    ...makePostgresOrderOutboxApplication(deps),
  };
};

export type OrdersApplication = ReturnType<
  typeof makePostgresOrdersApplication
>;

/**
 * The Worker receives only proposal ingestion and outbox projection
 * capabilities. Proposal acceptance and canonical Order commands remain at
 * the authenticated API composition edge.
 */
export const makePostgresOrdersWorkerApplication = (
  deps: OrdersPersistenceDeps,
) => {
  const proposalRepo = makePostgresProposeIncomingOrderRepository(deps.db);
  const closeSourceRepo = makePostgresCloseIncomingOrderSourceRepository(
    deps.db,
  );
  return {
    proposeIncomingOrder: makeProposeIncomingOrder(proposalRepo),
    closeIncomingOrderSource: makeCloseIncomingOrderSource({
      repo: closeSourceRepo,
      clock: deps.clock,
    }),
    ...makePostgresOrderOutboxApplication(deps),
  };
};

export type OrdersWorkerApplication = ReturnType<
  typeof makePostgresOrdersWorkerApplication
>;
