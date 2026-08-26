import { defineOperation } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { withdrawFulfillmentContract } from './contract.ts';
import { withdrawFulfillmentEmittedMessages } from './events.ts';
import { makeExecuteWithdrawFulfillment } from './execute.ts';
import { withdrawFulfillmentHttpSurfaces } from './http.ts';
import { makeWithdrawFulfillmentPostgresWriter } from './postgres.ts';
import {
  withdrawFulfillmentOperationId,
  type WithdrawFulfillmentCommand,
  type WithdrawFulfillmentExpectedFailure,
} from './types.ts';

export const withdrawFulfillmentCellDeclaration = defineOperation<
  WithdrawFulfillmentCommand,
  OrderMutationResult,
  WithdrawFulfillmentExpectedFailure
>({
  kind: 'command',
  id: withdrawFulfillmentOperationId,
  authentication: 'required',
  contract: withdrawFulfillmentContract,
  authorization: { capability: 'orders:manage', timing: 'before-input' },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    concurrencyKey: (input) => `${input.businessId}:${input.fulfillmentId}`,
    expectedVersion: (input) =>
      `${input.expectedOrderVersion}:${input.expectedFulfillmentVersion}`,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
    fingerprint: hashOrderCommand,
  },
  surfaces: withdrawFulfillmentHttpSurfaces,
  emits: withdrawFulfillmentEmittedMessages,
  consumes: [],
  observability: { operation: 'orders.withdraw_fulfillment' },
});

export const makeWithdrawFulfillmentCell = (dependencies: {
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: Clock;
}) =>
  defineOperation(
    withdrawFulfillmentCellDeclaration,
    makeExecuteWithdrawFulfillment({
      writer: makeWithdrawFulfillmentPostgresWriter(dependencies),
    }),
  );
