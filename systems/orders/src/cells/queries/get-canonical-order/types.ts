export type GetCanonicalOrderQuery = Readonly<{
  businessId: string;
  locationIds: readonly string[];
  orderId: string;
}>;

export type GetCanonicalOrderExpectedFailure =
  | Readonly<{
      kind: 'validation';
      code: 'order_get_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'order_not_found';
      message: string;
    }>;

export type GetCanonicalOrderRepository = Readonly<{
  get: (query: GetCanonicalOrderQuery) => Promise<CanonicalOrderDetail | null>;
}>;
import type { CanonicalOrderDetail } from '../../../model/canonical-order/model.ts';

export const getCanonicalOrderOperationId =
  'orders.get-canonical-order.v1' as const;
