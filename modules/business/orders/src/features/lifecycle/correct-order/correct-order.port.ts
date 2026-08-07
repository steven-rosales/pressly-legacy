import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../../../foundations/language/command-execution/order-command.model.ts';
import type { OrderInput } from '../../../foundations/language/order/order.model.ts';
import type { OrderAggregate } from '../../../foundations/language/order/order.entity.ts';
import type { OrderCommandOperations } from '../../../foundations/ports/order-command-store/order-command-store.port.ts';
import type { CorrectOrderFailure } from './correct-order.failure.ts';

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
) => Promise<Result<OrderMutationResult, CorrectOrderFailure>>;

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
    ) => Promise<OrderAggregate | null>;
    customerExists: (businessId: string, userId: string) => Promise<boolean>;
    applyOrderCorrection: (input: {
      current: OrderAggregate;
      changes: CorrectOrderCommand['changes'];
      nextFulfillment: OrderAggregate['fulfillment'];
      nextOrderVersion: number;
      nextFulfillmentVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type CorrectOrderRepository = UnitOfWork<CorrectOrderOperations>;
