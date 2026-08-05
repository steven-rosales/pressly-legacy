import type { UnitOfWork } from '@pressly/kernel';
import type { OrderAggregate } from '../../language/order/order.entity.ts';
import type { OrderState } from '../../language/order/order.model.ts';
import type { OrderCommandOperations } from '../order-command-store/order-command-store.port.ts';

export type OrderLifecycleTransactionOperations = OrderCommandOperations &
  Readonly<{
    lockOrder: (businessId: string, orderId: string) => Promise<void>;
    loadOrder: (
      businessId: string,
      orderId: string,
    ) => Promise<OrderAggregate | null>;
    applyOrderLifecycle: (input: {
      current: OrderAggregate;
      target: Exclude<OrderState, 'open'>;
      nextOrderVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type OrderLifecycleTransaction =
  UnitOfWork<OrderLifecycleTransactionOperations>;
