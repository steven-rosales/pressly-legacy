import type { CommandContext } from '@pressly/cells/command-context';

export const releaseFulfillmentOperationId =
  'orders.release-fulfillment.v1' as const;
export type ReleaseFulfillmentReasonCode =
  | 'ready_for_production'
  | 'manager_override';
export type ReleaseFulfillmentCommand = Readonly<{
  businessId: string;
  fulfillmentId: string;
  locationId: string;
  expectedOrderVersion: number;
  expectedFulfillmentVersion: number;
  idempotencyKey: string;
  context: CommandContext;
  reasonCode: ReleaseFulfillmentReasonCode;
  reasonNote: string | null;
}>;
export type ReleaseFulfillmentExpectedFailure =
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
