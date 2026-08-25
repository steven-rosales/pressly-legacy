import { bindCell, declareCommandCell } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { cancelOrderContract } from './contract.ts';
import { cancelOrderEmittedMessages } from './events.ts';
import { makeExecuteCancelOrder } from './execute.ts';
import { cancelOrderHttpSurfaces } from './http.ts';
import { makeCancelOrderPostgresWriter } from './postgres.ts';
import {
  cancelOrderOperationId,
  type CancelOrderCommand,
  type CancelOrderExpectedFailure,
} from './types.ts';

export const cancelOrderCellDeclaration = declareCommandCell<
  CancelOrderCommand,
  OrderMutationResult,
  CancelOrderExpectedFailure
>({
  id: cancelOrderOperationId,
  authentication: 'required',
  contract: cancelOrderContract,
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
  surfaces: cancelOrderHttpSurfaces,
  emits: cancelOrderEmittedMessages,
  consumes: [],
  observability: { operation: 'orders.cancel_order' },
});

export const makeCancelOrderCell = (dependencies: {
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: Clock;
}) =>
  bindCell(
    cancelOrderCellDeclaration,
    makeExecuteCancelOrder({
      writer: makeCancelOrderPostgresWriter(dependencies),
    }),
  );
