import type { ControlOrder } from '@pressly/contracts/orders';

export {
  controlOrderDetailSchema,
  controlOrderListSchema as controlOrderPageSchema,
  controlOrderSchema,
  orderMutationResultSchema,
} from '@pressly/contracts/orders';
export type {
  ControlOrder,
  ControlOrderDetail,
  ControlOrderList as ControlOrderPage,
  OrderMutationResult,
} from '@pressly/contracts/orders';

export type OrderState = ControlOrder['state'];
