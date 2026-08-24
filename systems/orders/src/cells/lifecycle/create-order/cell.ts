import type { OrderLocationFactsV1Capability } from '@pressly/access-system/capabilities/order-location-facts-v1';
import { bindCell, declareCommandCell } from '@pressly/cells';
import type { CustomerReferenceV1Capability } from '@pressly/customers-system/capabilities/customer-reference-v1';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { createOrderContract } from './contract.ts';
import { makeExecuteCreateOrder } from './execute.ts';
import { createOrderEmittedMessages } from './events.ts';
import { createOrderHttpSurfaces } from './http.ts';
import { makeCreateOrderPostgresWriter } from './postgres.ts';
import type {
  CreateOrderCommand,
  CreateOrderExpectedFailure,
} from './types.ts';

export const createOrderOperationId = 'orders.create-order.v1';

export const createOrderCellDeclaration = declareCommandCell<
  CreateOrderCommand,
  OrderMutationResult,
  CreateOrderExpectedFailure
>({
  id: createOrderOperationId,
  authentication: 'required',
  contract: createOrderContract,
  authorization: { capability: 'orders:manage', timing: 'before-input' },
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.idempotencyKey,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
    fingerprint: hashOrderCommand,
  },
  surfaces: createOrderHttpSurfaces,
  emits: createOrderEmittedMessages,
  consumes: [],
  observability: { operation: 'orders.create_order' },
});

export const makeCreateOrderCell = (dependencies: {
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: Clock;
  customerReferenceV1: CustomerReferenceV1Capability;
  orderLocationFactsV1: OrderLocationFactsV1Capability;
}) =>
  bindCell(
    createOrderCellDeclaration,
    makeExecuteCreateOrder({
      writer: makeCreateOrderPostgresWriter(dependencies),
    }),
  );
