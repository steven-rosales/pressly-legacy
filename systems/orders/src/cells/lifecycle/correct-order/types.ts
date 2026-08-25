import type { CommandContext } from '@pressly/cells/command-context';
import type { OrderDescriptionCorrection } from '../../../model/canonical-order/policy.ts';

export type CorrectOrderReasonCode =
  | 'customer_correction'
  | 'manager_correction'
  | 'source_discrepancy';
export type CorrectOrderCommand = Readonly<{
  businessId: string;
  locationId: string;
  orderId: string;
  expectedOrderVersion: number;
  expectedFulfillmentVersion: number;
  changes: OrderDescriptionCorrection;
  idempotencyKey: string;
  context: CommandContext;
  reasonCode: CorrectOrderReasonCode;
  reasonNote: string | null;
}>;
export type CorrectOrderExpectedFailure =
  | Readonly<{
      kind: 'validation';
      code: 'order_correction_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'order_not_found' | 'order_customer_not_found';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code:
        | 'order_version_conflict'
        | 'order_location_move_requires_command'
        | 'fulfillment_commitment_conflict'
        | 'order_idempotency_conflict';
      message: string;
    }>;
