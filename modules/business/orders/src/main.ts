import type { Database } from '@pressly/db';
import { makePostgresChangeOrderLifecycleRepository } from './change-order-lifecycle/change-order-lifecycle.repo.ts';
import {
  makeCancelOrder,
  makeCompleteOrder,
} from './change-order-lifecycle/change-order-lifecycle.usecase.ts';
import { makePostgresChangeFulfillmentReleaseRepository } from './change-fulfillment-release/change-fulfillment-release.repo.ts';
import {
  makeReleaseFulfillment,
  makeWithdrawFulfillment,
} from './change-fulfillment-release/change-fulfillment-release.usecase.ts';
import { makePostgresClaimOrderOutboxRepository } from './claim-order-outbox/claim-order-outbox.repo.ts';
import { makeClaimOrderOutbox } from './claim-order-outbox/claim-order-outbox.usecase.ts';
import { makePostgresCompleteOrderOutboxRepository } from './complete-order-outbox/complete-order-outbox.repo.ts';
import { makeCompleteOrderOutbox } from './complete-order-outbox/complete-order-outbox.usecase.ts';
import { makePostgresCorrectOrderRepository } from './correct-order/correct-order.repo.ts';
import { makeCorrectOrder } from './correct-order/correct-order.usecase.ts';
import { makePostgresCreateOrderRepository } from './create-order/create-order.repo.ts';
import { makeCreateOrder } from './create-order/create-order.usecase.ts';
import { makePostgresDeadLetterOrderOutboxRepository } from './dead-letter-order-outbox/dead-letter-order-outbox.repo.ts';
import { makeDeadLetterOrderOutbox } from './dead-letter-order-outbox/dead-letter-order-outbox.usecase.ts';
import {
  makePostgresIncomingOrderProposalRepository,
  makePostgresIncomingOrderProposalSubmissionRepository,
} from './incoming-order-proposal/incoming-order-proposal.repo.ts';
import type { IncomingOrderProposalCustomerPersistence } from './incoming-order-proposal/incoming-order-proposal.repo.ts';
import {
  makeAcceptIncomingOrderProposal,
  makeListIncomingOrderProposals,
  makeProposeIncomingOrder,
  makeRejectIncomingOrderProposal,
  makeRestoreIncomingOrderProposal,
} from './incoming-order-proposal/incoming-order-proposal.usecase.ts';
import { makeCloseIncomingOrderSource } from './incoming-order-proposal/close-incoming-order-source.usecase.ts';
import type { OrderClockPort } from './orders.port.ts';
import { makePostgresRetryOrderOutboxRepository } from './retry-order-outbox/retry-order-outbox.repo.ts';
import { makeRetryOrderOutbox } from './retry-order-outbox/retry-order-outbox.usecase.ts';

export type OrdersApplicationDeps = Readonly<{
  db: Database;
  clock: OrderClockPort;
  incomingOrderProposalCustomer: IncomingOrderProposalCustomerPersistence;
}>;

type OrdersPersistenceDeps = Readonly<{
  db: Database;
  clock: OrderClockPort;
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
  const lifecycleRepo = makePostgresChangeOrderLifecycleRepository(deps.db);
  const incomingProposalRepo = makePostgresIncomingOrderProposalRepository(
    deps.db,
    deps.incomingOrderProposalCustomer,
  );
  const releaseRepo = makePostgresChangeFulfillmentReleaseRepository(deps.db);
  return {
    proposeIncomingOrder: makeProposeIncomingOrder(incomingProposalRepo),
    listIncomingOrderProposals:
      makeListIncomingOrderProposals(incomingProposalRepo),
    acceptIncomingOrderProposal: makeAcceptIncomingOrderProposal({
      repo: incomingProposalRepo,
      clock: deps.clock,
    }),
    rejectIncomingOrderProposal: makeRejectIncomingOrderProposal({
      repo: incomingProposalRepo,
      clock: deps.clock,
    }),
    restoreIncomingOrderProposal: makeRestoreIncomingOrderProposal({
      repo: incomingProposalRepo,
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
  const proposalRepo = makePostgresIncomingOrderProposalSubmissionRepository(
    deps.db,
  );
  return {
    proposeIncomingOrder: makeProposeIncomingOrder(proposalRepo),
    closeIncomingOrderSource: makeCloseIncomingOrderSource({
      repo: proposalRepo,
      clock: deps.clock,
    }),
    ...makePostgresOrderOutboxApplication(deps),
  };
};

export type OrdersWorkerApplication = ReturnType<
  typeof makePostgresOrdersWorkerApplication
>;
