export {
  makePostgresOrdersApplication,
  type OrdersApplication,
  type OrdersApplicationDeps,
} from './main.ts';
export { fulfillmentDemandEvent } from './order-outbox.policy.ts';
export {
  mayTransitionFulfillment,
  mayTransitionOrder,
} from './order-lifecycle.policy.ts';
export type {
  ChangeFulfillmentRelease,
  ChangeFulfillmentReleaseCommand,
  ClaimOrderOutbox,
  ClaimOrderOutboxCommand,
  CompleteOrderOutbox,
  CompleteOrderOutboxCommand,
  DeadLetterOrderOutbox,
  DeadLetterOrderOutboxCommand,
  CreateOrder,
  CreateOrderCommand,
  FulfillmentInput,
  FulfillmentReleaseState,
  ObserveOrderSource,
  ObserveOrderSourceCommand,
  OrderCustomer,
  OrderInput,
  OrderItemInput,
  OrderMutationResult,
  OrderOutboxEvent,
  OrderSourceIdentity,
  OrderSourceObservationResult,
  OrderSourceRevision,
  OrderState,
  RetryOrderOutbox,
  RetryOrderOutboxCommand,
  UpdateOrder,
  UpdateOrderCommand,
} from './orders.port.ts';
