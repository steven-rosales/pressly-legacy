import { defineOperation } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { completeOrderContract } from './contract.ts';
import { completeOrderEmittedMessages } from './events.ts';
import { makeExecuteCompleteOrder } from './execute.ts';
import { completeOrderHttpSurfaces } from './http.ts';
import { makeCompleteOrderPostgresWriter } from './postgres.ts';
import {
  completeOrderOperationId,
  type CompleteOrderCommand,
  type CompleteOrderExpectedFailure,
} from './types.ts';

export const completeOrderCellDeclaration = defineOperation<
  CompleteOrderCommand,
  OrderMutationResult,
  CompleteOrderExpectedFailure
>({
  kind: 'command',
  id: completeOrderOperationId,
  authentication: 'required',
  contract: completeOrderContract,
  authorization: { capability: 'orders:manage', timing: 'before-input' },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    concurrencyKey: (input) => `${input.businessId}:${input.orderId}`,
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
    fingerprint: hashOrderCommand,
  },
  surfaces: completeOrderHttpSurfaces,
  emits: completeOrderEmittedMessages,
  consumes: [],
  observability: { operation: 'orders.complete_order' },
});

export const makeCompleteOrderCell = (dependencies: {
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: Clock;
}) =>
  defineOperation(
    completeOrderCellDeclaration,
    makeExecuteCompleteOrder({
      writer: makeCompleteOrderPostgresWriter(dependencies),
    }),
  );
