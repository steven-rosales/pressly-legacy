import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../command-execution/order-command.port.ts';
import type { OrderInput } from '../order-model/order.model.ts';
import type { StoredOrderAggregate } from '../persistence/order-aggregate.port.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../persistence/order-transaction.port.ts';

export type CorrectOrderReasonCode =
  | 'customer_correction'
  | 'manager_correction'
  | 'source_discrepancy';

export type FulfillmentDescriptionCorrection = Readonly<{
  typeCode?: string;
  /**
   * The use case does not permit moving an aggregate outside the command's
   * authorized location scope.
   */
  locationId?: string;
  estimatedWeight?: Readonly<{
    lbs: number | null;
    source: string | null;
  }>;
}>;

export type OrderDescriptionCorrection = Partial<
  Pick<
    OrderInput,
    | 'customer'
    | 'displayNumber'
    | 'dueAt'
    | 'currency'
    | 'totalAmountCents'
    | 'balanceDueCents'
    | 'items'
  >
> &
  Readonly<{ fulfillment?: FulfillmentDescriptionCorrection }>;

export type CorrectOrderCommand = AuditedOrderCommand<CorrectOrderReasonCode> &
  Readonly<{
    locationId: string;
    orderId: string;
    expectedOrderVersion: number;
    expectedFulfillmentVersion: number;
    changes: OrderDescriptionCorrection;
  }>;

export type CorrectOrder = (
  command: CorrectOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

export type CorrectOrderOperations = OrderCommandOperations &
  Readonly<{
    lockOrder: (businessId: string, orderId: string) => Promise<void>;
    lockFulfillment: (
      businessId: string,
      fulfillmentId: string,
    ) => Promise<void>;
    loadOrder: (
      businessId: string,
      orderId: string,
    ) => Promise<StoredOrderAggregate | null>;
    customerExists: (businessId: string, userId: string) => Promise<boolean>;
    applyOrderCorrection: (input: {
      current: StoredOrderAggregate;
      changes: CorrectOrderCommand['changes'];
      nextFulfillment: StoredOrderAggregate['fulfillment'];
      nextOrderVersion: number;
      nextFulfillmentVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type CorrectOrderRepository =
  OrderTransactionPort<CorrectOrderOperations>;
