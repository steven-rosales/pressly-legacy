import type { CommandContext } from '@pressly/cells/command-context';

export const withdrawFulfillmentOperationId =
  'orders.withdraw-fulfillment.v1' as const;
export type WithdrawFulfillmentReasonCode =
  | 'commercial_canceled'
  | 'production_hold'
  | 'manager_override';
export type WithdrawFulfillmentCommand = Readonly<{
  businessId: string;
  fulfillmentId: string;
  locationId: string;
  expectedOrderVersion: number;
  expectedFulfillmentVersion: number;
  idempotencyKey: string;
  context: CommandContext;
  reasonCode: WithdrawFulfillmentReasonCode;
  reasonNote: string | null;
}>;
export type WithdrawFulfillmentExpectedFailure =
  | Readonly<{
      kind: 'validation';
      code: 'fulfillment_release_command_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'fulfillment_not_found';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code:
        | 'fulfillment_version_conflict'
        | 'fulfillment_transition_invalid'
        | 'order_idempotency_conflict';
      message: string;
    }>;
