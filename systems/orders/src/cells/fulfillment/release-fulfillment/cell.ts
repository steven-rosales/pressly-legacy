import { bindCell, declareCommandCell } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { releaseFulfillmentContract } from './contract.ts';
import { releaseFulfillmentEmittedMessages } from './events.ts';
import { makeExecuteReleaseFulfillment } from './execute.ts';
import { releaseFulfillmentHttpSurfaces } from './http.ts';
import { makeReleaseFulfillmentPostgresWriter } from './postgres.ts';
import {
  releaseFulfillmentOperationId,
  type ReleaseFulfillmentCommand,
  type ReleaseFulfillmentExpectedFailure,
} from './types.ts';

export const releaseFulfillmentCellDeclaration = declareCommandCell<
  ReleaseFulfillmentCommand,
  OrderMutationResult,
  ReleaseFulfillmentExpectedFailure
>({
  id: releaseFulfillmentOperationId,
  authentication: 'required',
  contract: releaseFulfillmentContract,
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
  surfaces: releaseFulfillmentHttpSurfaces,
  emits: releaseFulfillmentEmittedMessages,
  consumes: [],
  observability: { operation: 'orders.release_fulfillment' },
});

export const makeReleaseFulfillmentCell = (dependencies: {
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: Clock;
}) =>
  bindCell(
    releaseFulfillmentCellDeclaration,
    makeExecuteReleaseFulfillment({
      writer: makeReleaseFulfillmentPostgresWriter(dependencies),
    }),
  );
