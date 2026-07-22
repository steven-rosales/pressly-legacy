import type { Database } from '@pressly/db';
import { makePostgresChangeFulfillmentReleaseRepository } from './change-fulfillment-release/change-fulfillment-release.repo.ts';
import { makeChangeFulfillmentRelease } from './change-fulfillment-release/change-fulfillment-release.usecase.ts';
import { makePostgresClaimOrderOutboxRepository } from './claim-order-outbox/claim-order-outbox.repo.ts';
import { makeClaimOrderOutbox } from './claim-order-outbox/claim-order-outbox.usecase.ts';
import { makePostgresCompleteOrderOutboxRepository } from './complete-order-outbox/complete-order-outbox.repo.ts';
import { makeCompleteOrderOutbox } from './complete-order-outbox/complete-order-outbox.usecase.ts';
import { makePostgresCreateOrderRepository } from './create-order/create-order.repo.ts';
import { makeCreateOrder } from './create-order/create-order.usecase.ts';
import { makePostgresDeadLetterOrderOutboxRepository } from './dead-letter-order-outbox/dead-letter-order-outbox.repo.ts';
import { makeDeadLetterOrderOutbox } from './dead-letter-order-outbox/dead-letter-order-outbox.usecase.ts';
import { makePostgresObserveOrderSourceRepository } from './observe-order-source/observe-order-source.repo.ts';
import { makeObserveOrderSource } from './observe-order-source/observe-order-source.usecase.ts';
import type { OrderClockPort } from './orders.port.ts';
import { makePostgresRetryOrderOutboxRepository } from './retry-order-outbox/retry-order-outbox.repo.ts';
import { makeRetryOrderOutbox } from './retry-order-outbox/retry-order-outbox.usecase.ts';
import { makePostgresUpdateOrderRepository } from './update-order/update-order.repo.ts';
import { makeUpdateOrder } from './update-order/update-order.usecase.ts';

export type OrdersApplicationDeps = Readonly<{
  db: Database;
  clock: OrderClockPort;
}>;

export const makePostgresOrdersApplication = (deps: OrdersApplicationDeps) => {
  const sourceRepo = makePostgresObserveOrderSourceRepository(deps.db);
  const createRepo = makePostgresCreateOrderRepository(deps.db);
  const updateRepo = makePostgresUpdateOrderRepository(deps.db);
  const releaseRepo = makePostgresChangeFulfillmentReleaseRepository(deps.db);
  const claimOutboxRepo = makePostgresClaimOrderOutboxRepository(deps.db);
  const completeOutboxRepo = makePostgresCompleteOrderOutboxRepository(deps.db);
  const retryOutboxRepo = makePostgresRetryOrderOutboxRepository(deps.db);
  const deadLetterOutboxRepo = makePostgresDeadLetterOrderOutboxRepository(
    deps.db,
  );
  return {
    observeSource: makeObserveOrderSource(sourceRepo),
    createOrder: makeCreateOrder({ repo: createRepo, clock: deps.clock }),
    updateOrder: makeUpdateOrder({ repo: updateRepo, clock: deps.clock }),
    changeFulfillmentRelease: makeChangeFulfillmentRelease({
      repo: releaseRepo,
      clock: deps.clock,
    }),
    claimOutbox: makeClaimOrderOutbox({
      repo: claimOutboxRepo,
      clock: deps.clock,
    }),
    completeOutbox: makeCompleteOrderOutbox({
      repo: completeOutboxRepo,
      clock: deps.clock,
    }),
    retryOutbox: makeRetryOrderOutbox(retryOutboxRepo),
    deadLetterOutbox: makeDeadLetterOrderOutbox({
      repo: deadLetterOutboxRepo,
      clock: deps.clock,
    }),
  };
};

export type OrdersApplication = ReturnType<
  typeof makePostgresOrdersApplication
>;
