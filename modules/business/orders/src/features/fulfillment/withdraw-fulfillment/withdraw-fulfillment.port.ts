import type { Result } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../../../foundations/language/command-execution/order-command.model.ts';
import type { FulfillmentReleaseFailure } from '../../../foundations/language/fulfillment-release/fulfillment-release.failure.ts';

export type WithdrawFulfillmentReasonCode =
  | 'commercial_canceled'
  | 'production_hold'
  | 'manager_override';

export type WithdrawFulfillmentCommand =
  AuditedOrderCommand<WithdrawFulfillmentReasonCode> &
    Readonly<{
      fulfillmentId: string;
      locationId: string;
      expectedOrderVersion: number;
      expectedFulfillmentVersion: number;
    }>;

export type WithdrawFulfillment = (
  command: WithdrawFulfillmentCommand,
) => Promise<Result<OrderMutationResult, FulfillmentReleaseFailure>>;
