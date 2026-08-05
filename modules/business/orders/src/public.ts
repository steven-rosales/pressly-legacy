export {
  decideFulfillmentRelease,
  type FulfillmentReleaseDecision,
  type FulfillmentReleaseEvent,
} from './foundations/language/fulfillment-release/fulfillment-release.lifecycle.ts';
export { mayTransitionFulfillment } from './foundations/language/fulfillment-release/fulfillment-release.policy.ts';
export { releaseFulfillmentReasonCodes } from './features/fulfillment/release-fulfillment/release-fulfillment.policy.ts';
export { withdrawFulfillmentReasonCodes } from './features/fulfillment/withdraw-fulfillment/withdraw-fulfillment.policy.ts';
export type { FulfillmentReleaseFailure } from './foundations/language/fulfillment-release/fulfillment-release.failure.ts';
export type {
  ReleaseFulfillment,
  ReleaseFulfillmentCommand,
  ReleaseFulfillmentReasonCode,
} from './features/fulfillment/release-fulfillment/release-fulfillment.port.ts';
export type {
  WithdrawFulfillment,
  WithdrawFulfillmentCommand,
  WithdrawFulfillmentReasonCode,
} from './features/fulfillment/withdraw-fulfillment/withdraw-fulfillment.port.ts';
export { cancelOrderReasonCodes } from './features/lifecycle/cancel-order/cancel-order.policy.ts';
export { completeOrderReasonCodes } from './features/lifecycle/complete-order/complete-order.policy.ts';
export {
  decideOrderLifecycle,
  type OrderLifecycleDecision,
  type OrderLifecycleEvent,
} from './foundations/language/order-lifecycle/order-lifecycle.lifecycle.ts';
export { mayTransitionOrder } from './foundations/language/order-lifecycle/order-lifecycle.policy.ts';
export type { OrderLifecycleFailure } from './foundations/language/order-lifecycle/order-lifecycle.failure.ts';
export type {
  CancelOrder,
  CancelOrderCommand,
  CancelOrderReasonCode,
} from './features/lifecycle/cancel-order/cancel-order.port.ts';
export type {
  CompleteOrder,
  CompleteOrderCommand,
  CompleteOrderReasonCode,
} from './features/lifecycle/complete-order/complete-order.port.ts';
export type { OrderMutationResult } from './foundations/language/command-execution/order-command.model.ts';
export { correctOrderReasonCodes } from './features/lifecycle/correct-order/correct-order.policy.ts';
export type { CorrectOrderFailure } from './features/lifecycle/correct-order/correct-order.failure.ts';
export type {
  CorrectOrder,
  CorrectOrderCommand,
  CorrectOrderReasonCode,
  FulfillmentDescriptionCorrection,
  OrderDescriptionCorrection,
} from './features/lifecycle/correct-order/correct-order.port.ts';
export { createOrderReasonCodes } from './features/lifecycle/create-order/create-order.policy.ts';
export type { CreateOrderFailure } from './features/lifecycle/create-order/create-order.failure.ts';
export type {
  CreateOrder,
  CreateOrderCommand,
  CreateOrderReasonCode,
} from './features/lifecycle/create-order/create-order.port.ts';
export {
  allowedIncomingOrderProposalEvents,
  decideIncomingOrderProposal,
  incomingOrderProposalGraph,
  type IncomingOrderProposalDecision,
} from './foundations/language/incoming-order-proposal/incoming-order-proposal.lifecycle.ts';
export type {
  IncomingOrderProposalCustomer,
  IncomingOrderProposalDecisionResult,
  IncomingOrderProposalEvent,
  IncomingOrderProposalSnapshot,
  IncomingOrderProposalState,
} from './foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';
export type {
  AcceptIncomingOrderProposalCommand,
  AcceptIncomingOrderProposalReasonCode,
} from './features/intake/accept-incoming-order-proposal/accept-incoming-order-proposal.model.ts';
export type {
  AcceptIncomingOrderProposalFailure,
  IncomingOrderProposalCustomerFailure,
} from './features/intake/accept-incoming-order-proposal/accept-incoming-order-proposal.failure.ts';
export type { AcceptIncomingOrderProposal } from './features/intake/accept-incoming-order-proposal/accept-incoming-order-proposal.port.ts';
export type {
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceResult,
} from './features/intake/close-incoming-order-source/close-incoming-order-source.model.ts';
export type { CloseIncomingOrderSource } from './features/intake/close-incoming-order-source/close-incoming-order-source.port.ts';
export type { CloseIncomingOrderSourceFailure } from './features/intake/close-incoming-order-source/close-incoming-order-source.failure.ts';
export type {
  IncomingOrderProposalListResult,
  IncomingOrderProposalSummary,
  ListIncomingOrderProposalsQuery,
} from './features/intake/list-incoming-order-proposals/list-incoming-order-proposals.model.ts';
export type { ListIncomingOrderProposals } from './features/intake/list-incoming-order-proposals/list-incoming-order-proposals.port.ts';
export type { ListIncomingOrderProposalsFailure } from './features/intake/list-incoming-order-proposals/list-incoming-order-proposals.failure.ts';
export type {
  IncomingOrderProposalMutationResult,
  ProposeIncomingOrderCommand,
} from './features/intake/propose-incoming-order/propose-incoming-order.model.ts';
export type { ProposeIncomingOrder } from './features/intake/propose-incoming-order/propose-incoming-order.port.ts';
export type { ProposeIncomingOrderFailure } from './features/intake/propose-incoming-order/propose-incoming-order.failure.ts';
export type {
  RejectIncomingOrderProposalCommand,
  RejectIncomingOrderProposalReasonCode,
} from './features/intake/reject-incoming-order-proposal/reject-incoming-order-proposal.model.ts';
export type { RejectIncomingOrderProposal } from './features/intake/reject-incoming-order-proposal/reject-incoming-order-proposal.port.ts';
export type { RejectIncomingOrderProposalFailure } from './features/intake/reject-incoming-order-proposal/reject-incoming-order-proposal.failure.ts';
export type {
  RestoreIncomingOrderProposalCommand,
  RestoreIncomingOrderProposalResult,
} from './features/intake/restore-incoming-order-proposal/restore-incoming-order-proposal.model.ts';
export type { RestoreIncomingOrderProposal } from './features/intake/restore-incoming-order-proposal/restore-incoming-order-proposal.port.ts';
export type { RestoreIncomingOrderProposalFailure } from './features/intake/restore-incoming-order-proposal/restore-incoming-order-proposal.failure.ts';
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
} from './foundations/language/order/order.model.ts';
export { fulfillmentDemandEvent } from './foundations/language/order-outbox/order-outbox.policy.ts';
export type {
  ClaimOrderOutboxCommand,
  CompleteOrderOutboxCommand,
  DeadLetterOrderOutboxCommand,
  FulfillmentDemandChangedEvent,
  OrderOutboxEvent,
  RetryOrderOutboxCommand,
} from './foundations/language/order-outbox/order-outbox.model.ts';
export type { ClaimOrderOutbox } from './features/outbox/claim-order-outbox/claim-order-outbox.port.ts';
export type { ClaimOrderOutboxFailure } from './features/outbox/claim-order-outbox/claim-order-outbox.failure.ts';
export type { CompleteOrderOutbox } from './features/outbox/complete-order-outbox/complete-order-outbox.port.ts';
export type { DeadLetterOrderOutbox } from './features/outbox/dead-letter-order-outbox/dead-letter-order-outbox.port.ts';
export type { DeadLetterOrderOutboxFailure } from './features/outbox/dead-letter-order-outbox/dead-letter-order-outbox.failure.ts';
export type { RetryOrderOutbox } from './features/outbox/retry-order-outbox/retry-order-outbox.port.ts';
export {
  decodeOrderCursor,
  encodeOrderCursor,
} from './features/queries/list-canonical-orders/order-pagination.policy.ts';
export type {
  CanonicalOrderDetail,
  CanonicalOrderSummary,
} from './foundations/language/canonical-order-read/canonical-order-read.model.ts';
export type { GetCanonicalOrder } from './features/queries/get-canonical-order/get-canonical-order.usecase.ts';
export type { GetCanonicalOrderFailure } from './features/queries/get-canonical-order/get-canonical-order.failure.ts';
export type {
  CanonicalOrderListResult,
  ListCanonicalOrdersQuery,
} from './features/queries/list-canonical-orders/list-canonical-orders.model.ts';
export type { ListCanonicalOrders } from './features/queries/list-canonical-orders/list-canonical-orders.usecase.ts';
export type { ListCanonicalOrdersFailure } from './features/queries/list-canonical-orders/list-canonical-orders.failure.ts';
import type { ReleaseFulfillmentCommand } from './features/fulfillment/release-fulfillment/release-fulfillment.port.ts';
import type { WithdrawFulfillmentCommand } from './features/fulfillment/withdraw-fulfillment/withdraw-fulfillment.port.ts';
import type { CancelOrderCommand } from './features/lifecycle/cancel-order/cancel-order.port.ts';
import type { CompleteOrderCommand } from './features/lifecycle/complete-order/complete-order.port.ts';
import type { CorrectOrderCommand } from './features/lifecycle/correct-order/correct-order.port.ts';
import type { CreateOrderCommand } from './features/lifecycle/create-order/create-order.port.ts';

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
