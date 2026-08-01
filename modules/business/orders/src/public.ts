export {
  decideFulfillmentRelease,
  mayTransitionFulfillment,
  releaseFulfillmentReasonCodes,
  type FulfillmentReleaseDecision,
  type FulfillmentReleaseEvent,
  withdrawFulfillmentReasonCodes,
} from './change-fulfillment-release/change-fulfillment-release.policy.ts';
export type {
  ReleaseFulfillment,
  ReleaseFulfillmentCommand,
  ReleaseFulfillmentReasonCode,
  WithdrawFulfillment,
  WithdrawFulfillmentCommand,
  WithdrawFulfillmentReasonCode,
} from './change-fulfillment-release/change-fulfillment-release.port.ts';
export {
  cancelOrderReasonCodes,
  completeOrderReasonCodes,
  decideOrderLifecycle,
  mayTransitionOrder,
  type OrderLifecycleDecision,
  type OrderLifecycleEvent,
} from './change-order-lifecycle/change-order-lifecycle.policy.ts';
export type {
  CancelOrder,
  CancelOrderCommand,
  CancelOrderReasonCode,
  CompleteOrder,
  CompleteOrderCommand,
  CompleteOrderReasonCode,
} from './change-order-lifecycle/change-order-lifecycle.port.ts';
export type { OrderMutationResult } from './command-execution/order-command.port.ts';
export { correctOrderReasonCodes } from './correct-order/correct-order.policy.ts';
export type {
  CorrectOrder,
  CorrectOrderCommand,
  CorrectOrderReasonCode,
  FulfillmentDescriptionCorrection,
  OrderDescriptionCorrection,
} from './correct-order/correct-order.port.ts';
export { createOrderReasonCodes } from './create-order/create-order.policy.ts';
export type {
  CreateOrder,
  CreateOrderCommand,
  CreateOrderReasonCode,
} from './create-order/create-order.port.ts';
export {
  allowedIncomingOrderProposalEvents,
  decideIncomingOrderProposal,
  incomingOrderProposalGraph,
  type IncomingOrderProposalDecision,
} from './incoming-order-proposal/incoming-order-proposal.policy.ts';
export type {
  AcceptIncomingOrderProposal,
  AcceptIncomingOrderProposalCommand,
  AcceptIncomingOrderProposalReasonCode,
  CloseIncomingOrderSource,
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceResult,
  IncomingOrderProposalCustomer,
  IncomingOrderProposalDecisionResult,
  IncomingOrderProposalEvent,
  IncomingOrderProposalListResult,
  IncomingOrderProposalMutationResult,
  IncomingOrderProposalSnapshot,
  IncomingOrderProposalState,
  IncomingOrderProposalSummary,
  ListIncomingOrderProposals,
  ListIncomingOrderProposalsQuery,
  ProposeIncomingOrder,
  ProposeIncomingOrderCommand,
  RejectIncomingOrderProposal,
  RejectIncomingOrderProposalCommand,
  RejectIncomingOrderProposalReasonCode,
  RestoreIncomingOrderProposal,
  RestoreIncomingOrderProposalCommand,
  RestoreIncomingOrderProposalResult,
} from './incoming-order-proposal/incoming-order-proposal.port.ts';
export {
  makePostgresOrdersApplication,
  makePostgresOrdersWorkerApplication,
  type OrdersApplication,
  type OrdersApplicationDeps,
  type OrdersWorkerApplication,
} from './main.ts';
export type {
  DirectFulfillmentInput,
  DirectOrderInput,
  FulfillmentInput,
  FulfillmentReleaseState,
  OrderCustomer,
  OrderInput,
  OrderItemInput,
  OrderState,
} from './order-model/order-model.port.ts';
export { fulfillmentDemandEvent } from './order-outbox/order-outbox.policy.ts';
export type {
  ClaimOrderOutbox,
  ClaimOrderOutboxCommand,
  CompleteOrderOutbox,
  CompleteOrderOutboxCommand,
  DeadLetterOrderOutbox,
  DeadLetterOrderOutboxCommand,
  OrderOutboxEvent,
  RetryOrderOutbox,
  RetryOrderOutboxCommand,
} from './order-outbox/order-outbox.port.ts';
export {
  decodeOrderCursor,
  encodeOrderCursor,
} from './read-orders/order-pagination.policy.ts';
export type {
  CanonicalOrderDetail,
  CanonicalOrderListResult,
  CanonicalOrderSummary,
  GetCanonicalOrder,
  ListCanonicalOrders,
  ListCanonicalOrdersQuery,
} from './read-orders/read-orders.port.ts';
import type {
  ReleaseFulfillmentCommand,
  WithdrawFulfillmentCommand,
} from './change-fulfillment-release/change-fulfillment-release.port.ts';
import type {
  CancelOrderCommand,
  CompleteOrderCommand,
} from './change-order-lifecycle/change-order-lifecycle.port.ts';
import type { CorrectOrderCommand } from './correct-order/correct-order.port.ts';
import type { CreateOrderCommand } from './create-order/create-order.port.ts';

/*
 * Canonical lifecycle and release commands intentionally have distinct
 * public types. A first-party caller cannot smuggle a target state through a
 * generic update payload.
 */
export type CanonicalOrderCommand =
  | CreateOrderCommand
  | CorrectOrderCommand
  | CompleteOrderCommand
  | CancelOrderCommand
  | ReleaseFulfillmentCommand
  | WithdrawFulfillmentCommand;
