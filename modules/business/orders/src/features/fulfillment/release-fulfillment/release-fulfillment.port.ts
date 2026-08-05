import type { Result } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../../../foundations/language/command-execution/order-command.model.ts';
import type { FulfillmentReleaseFailure } from '../../../foundations/language/fulfillment-release/fulfillment-release.failure.ts';

export type ReleaseFulfillmentReasonCode =
  | 'ready_for_production'
  | 'manager_override';

export type ReleaseFulfillmentCommand =
  AuditedOrderCommand<ReleaseFulfillmentReasonCode> &
    Readonly<{
      fulfillmentId: string;
      locationId: string;
      expectedOrderVersion: number;
      expectedFulfillmentVersion: number;
    }>;

export type ReleaseFulfillment = (
  command: ReleaseFulfillmentCommand,
) => Promise<Result<OrderMutationResult, FulfillmentReleaseFailure>>;
