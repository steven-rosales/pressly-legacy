import type { OrdersSystem } from '../system.ts';

export type OrderManagementOperations = Pick<
  OrdersSystem['cells'],
  'correctOrder' | 'createOrder' | 'getCanonicalOrder' | 'listCanonicalOrders'
>;
