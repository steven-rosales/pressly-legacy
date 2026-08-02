import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../command-execution/order-command.port.ts';
import type { FulfillmentReleaseState } from '../order-model/order.model.ts';
import type { StoredOrderAggregate } from '../persistence/order-aggregate.port.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../persistence/order-transaction.port.ts';

export type ReleaseFulfillmentReasonCode =
  | 'ready_for_production'
  | 'manager_override';
export type WithdrawFulfillmentReasonCode =
  | 'commercial_canceled'
  | 'production_hold'
  | 'manager_override';

type FulfillmentReleaseCommand<ReasonCode extends string> =
  AuditedOrderCommand<ReasonCode> &
    Readonly<{
      fulfillmentId: string;
      locationId: string;
      expectedOrderVersion: number;
      expectedFulfillmentVersion: number;
    }>;

export type ReleaseFulfillmentCommand =
  FulfillmentReleaseCommand<ReleaseFulfillmentReasonCode>;
export type ReleaseFulfillment = (
  command: ReleaseFulfillmentCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

export type WithdrawFulfillmentCommand =
  FulfillmentReleaseCommand<WithdrawFulfillmentReasonCode>;
export type WithdrawFulfillment = (
  command: WithdrawFulfillmentCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

export type ChangeFulfillmentReleaseOperations = OrderCommandOperations &
  Readonly<{
    findOrderId: (
      businessId: string,
      fulfillmentId: string,
    ) => Promise<string | null>;
    lockOrder: (businessId: string, orderId: string) => Promise<void>;
    lockFulfillment: (
      businessId: string,
      fulfillmentId: string,
    ) => Promise<void>;
    loadFulfillmentOrder: (
      businessId: string,
      fulfillmentId: string,
    ) => Promise<StoredOrderAggregate | null>;
    applyFulfillmentRelease: (input: {
      current: StoredOrderAggregate;
      target: FulfillmentReleaseState;
      nextOrderVersion: number;
      nextFulfillmentVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type ChangeFulfillmentReleaseRepository =
  OrderTransactionPort<ChangeFulfillmentReleaseOperations>;
