import { defineOperation } from '@pressly/cells';
import type { CustomerReferenceV1Capability } from '@pressly/customers-system/capabilities/customer-reference-v1';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { correctOrderContract } from './contract.ts';
import { makeExecuteCorrectOrder } from './execute.ts';
import { correctOrderEmittedMessages } from './events.ts';
import { correctOrderHttpSurfaces } from './http.ts';
import { makeCorrectOrderPostgresWriter } from './postgres.ts';
import type {
  CorrectOrderCommand,
  CorrectOrderExpectedFailure,
} from './types.ts';

export const correctOrderOperationId = 'orders.correct-order.v1';

export const correctOrderCellDeclaration = defineOperation<
  CorrectOrderCommand,
  OrderMutationResult,
  CorrectOrderExpectedFailure
>({
  kind: 'command',
  id: correctOrderOperationId,
  authentication: 'required',
  contract: correctOrderContract,
  authorization: { capability: 'orders:manage', timing: 'before-input' },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    concurrencyKey: (input) => `${input.businessId}:${input.orderId}`,
    expectedVersion: (input) =>
      `${input.expectedOrderVersion}:${input.expectedFulfillmentVersion}`,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
    fingerprint: hashOrderCommand,
  },
  surfaces: correctOrderHttpSurfaces,
  emits: correctOrderEmittedMessages,
  consumes: [],
  observability: { operation: 'orders.correct_order' },
});

export const makeCorrectOrderCell = (dependencies: {
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: Clock;
  customerReferenceV1: CustomerReferenceV1Capability;
}) =>
  defineOperation(
    correctOrderCellDeclaration,
    makeExecuteCorrectOrder({
      writer: makeCorrectOrderPostgresWriter(dependencies),
    }),
  );
