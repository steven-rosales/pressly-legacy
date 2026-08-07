import type { Result } from '@pressly/kernel';
import type { ControlCommandContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlOrderRejection } from '../../../foundations/language/control-order/control-order.failure.ts';
import type { ControlOrderMutation } from '../../../foundations/language/control-order/control-order.model.ts';
import type {
  ControlOrderCustomerReference,
  ControlOrderFulfillmentInput,
  ControlOrderItem,
} from '../../../foundations/language/control-order/control-order.value.ts';

export type CreateControlOrderPort = (input: {
  businessId: string;
  idempotencyKey: string;
  context: ControlCommandContext;
  reasonCode: 'new_customer_order' | 'recovery_entry';
  reasonNote: string | null;
  customer: ControlOrderCustomerReference;
  displayNumber: string | null;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  items: readonly ControlOrderItem[];
  fulfillment: ControlOrderFulfillmentInput;
}) => Promise<Result<ControlOrderMutation, ControlOrderRejection>>;
