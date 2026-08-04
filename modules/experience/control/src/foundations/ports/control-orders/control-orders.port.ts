import type { Result } from '@pressly/kernel';
import type { ControlCommandContext } from '../../language/control-context/control-context.value.ts';
import type {
  ControlOrderDescriptionChanges,
  ControlOrderDetailSnapshot,
  ControlOrderMutation,
  ControlOrderSnapshot,
} from '../../language/control-order/control-order.model.ts';
import type {
  ControlOrderCustomerReference,
  ControlOrderFulfillmentInput,
  ControlOrderItem,
  ControlOrderState,
} from '../../language/control-order/control-order.value.ts';

export type ControlOrderRejection = Readonly<{
  kind: 'order_rejected';
  category:
    | 'validation'
    | 'authentication'
    | 'permission'
    | 'not_found'
    | 'conflict'
    | 'rate_limit';
  code: string;
  message: string;
  details?: Readonly<{
    currentVersion?: number;
    violations?: readonly string[];
  }>;
}>;

export type ControlOrdersPort = Readonly<{
  list: (input: {
    businessId: string;
    locationIds: readonly string[];
    query: string | null;
    state: ControlOrderState | null;
    limit: number;
    cursor: string | null;
  }) => Promise<
    Result<
      Readonly<{
        items: readonly ControlOrderSnapshot[];
        nextCursor: string | null;
      }>,
      ControlOrderRejection
    >
  >;
  get: (input: {
    businessId: string;
    locationIds: readonly string[];
    orderId: string;
  }) => Promise<Result<ControlOrderDetailSnapshot, ControlOrderRejection>>;
  create: (input: {
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
  correct: (input: {
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
}>;
