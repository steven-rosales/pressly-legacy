import type { Result } from '@pressly/kernel';
import type { ControlCommandContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlOrderRejection } from '../../../foundations/language/control-order/control-order.failure.ts';
import type {
  ControlOrderDescriptionChanges,
  ControlOrderMutation,
} from '../../../foundations/language/control-order/control-order.model.ts';

export type CorrectControlOrderPort = (input: {
  businessId: string;
  idempotencyKey: string;
  context: ControlCommandContext;
  reasonCode:
    | 'customer_correction'
    | 'manager_correction'
    | 'source_discrepancy';
  reasonNote: string | null;
  expectedOrderVersion: number;
  expectedFulfillmentVersion: number;
  locationId: string;
  orderId: string;
  changes: ControlOrderDescriptionChanges;
}) => Promise<Result<ControlOrderMutation, ControlOrderRejection>>;
