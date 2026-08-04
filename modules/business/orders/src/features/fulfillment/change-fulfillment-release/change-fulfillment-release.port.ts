import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../../../foundations/language/command-execution/order-command.model.ts';
import type { FulfillmentReleaseState } from '../../../foundations/language/order/order.model.ts';
import type { OrderAggregate } from '../../../foundations/language/order/order.entity.ts';
import type { OrderCommandOperations } from '../../../foundations/ports/order-command-store/order-command-store.port.ts';
import type { ChangeFulfillmentReleaseFailure } from './change-fulfillment-release.failure.ts';

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
) => Promise<Result<OrderMutationResult, ChangeFulfillmentReleaseFailure>>;

export type WithdrawFulfillmentCommand =
  FulfillmentReleaseCommand<WithdrawFulfillmentReasonCode>;
export type WithdrawFulfillment = (
  command: WithdrawFulfillmentCommand,
) => Promise<Result<OrderMutationResult, ChangeFulfillmentReleaseFailure>>;

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
    ) => Promise<OrderAggregate | null>;
    applyFulfillmentRelease: (input: {
      current: OrderAggregate;
      target: FulfillmentReleaseState;
      nextOrderVersion: number;
      nextFulfillmentVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type ChangeFulfillmentReleaseRepository =
  UnitOfWork<ChangeFulfillmentReleaseOperations>;
