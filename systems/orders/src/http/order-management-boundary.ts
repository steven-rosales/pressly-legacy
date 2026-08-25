import {
  defineHttpBoundaryProfile,
  type HttpBoundaryProfile,
} from '@pressly/cells';
import { acceptIncomingOrderProposalOperationId } from '../cells/intake/accept-incoming-order-proposal/cell.ts';
import { listIncomingOrderProposalsOperationId } from '../cells/intake/list-incoming-order-proposals/types.ts';
import { rejectIncomingOrderProposalOperationId } from '../cells/intake/reject-incoming-order-proposal/cell.ts';
import { restoreIncomingOrderProposalOperationId } from '../cells/intake/restore-incoming-order-proposal/cell.ts';
import { releaseFulfillmentOperationId } from '../cells/fulfillment/release-fulfillment/types.ts';
import { withdrawFulfillmentOperationId } from '../cells/fulfillment/withdraw-fulfillment/types.ts';
import { cancelOrderOperationId } from '../cells/lifecycle/cancel-order/types.ts';
import { completeOrderOperationId } from '../cells/lifecycle/complete-order/types.ts';
import { correctOrderOperationId } from '../cells/lifecycle/correct-order/cell.ts';
import { createOrderOperationId } from '../cells/lifecycle/create-order/cell.ts';
import { orderManagementContextRequirements } from '../model/order-management-http.ts';

export type OrderManagementHttpBoundaryRequirement = Readonly<{
  operationId: string;
  profile: HttpBoundaryProfile;
}>;

type RequirementInput = Readonly<{
  operationId: string;
  inputValidationPhase: 'after-authentication' | 'after-authorization';
  contextProviders: readonly string[];
}>;

const requirement = (
  input: RequirementInput,
): OrderManagementHttpBoundaryRequirement => ({
  operationId: input.operationId,
  profile: defineHttpBoundaryProfile({
    id: `${input.operationId}.http`,
    authentication: {
      provider: 'processor-cookie-or-bearer-session',
      required: true,
    },
    requestBody: {
      acceptedContentTypes: ['application/json'],
      contentType: 'parse-if-matching',
      parser: 'json-document',
      phase: 'before-authentication',
    },
    exactOrigin: null,
    csrf: null,
    requestRateLimit: null,
    identityRateLimit: null,
    inputValidationPhase: input.inputValidationPhase,
    noStore: false,
    contextProviders: input.contextProviders,
    authorization: 'access-policy',
    expectedFailureObservation: 'central-api-error-observation',
  }),
});

const proposalContext = Object.freeze([
  orderManagementContextRequirements.principal,
]);
const canonicalContext = Object.freeze([
  orderManagementContextRequirements.business,
  orderManagementContextRequirements.principal,
]);

export const orderManagementHttpBoundaryRequirements = Object.freeze([
  requirement({
    operationId: listIncomingOrderProposalsOperationId,
    inputValidationPhase: 'after-authentication',
    contextProviders: [],
  }),
  ...[
    acceptIncomingOrderProposalOperationId,
    rejectIncomingOrderProposalOperationId,
    restoreIncomingOrderProposalOperationId,
  ].map((operationId) =>
    requirement({
      operationId,
      inputValidationPhase: 'after-authorization',
      contextProviders: proposalContext,
    }),
  ),
  ...[
    createOrderOperationId,
    correctOrderOperationId,
    completeOrderOperationId,
    cancelOrderOperationId,
    releaseFulfillmentOperationId,
    withdrawFulfillmentOperationId,
  ].map((operationId) =>
    requirement({
      operationId,
      inputValidationPhase: 'after-authorization',
      contextProviders: canonicalContext,
    }),
  ),
]) satisfies readonly OrderManagementHttpBoundaryRequirement[];

export const orderManagementHttpBoundaryProfiles = Object.freeze(
  Object.fromEntries(
    orderManagementHttpBoundaryRequirements.map((entry) => [
      entry.operationId,
      entry.profile,
    ]),
  ),
);
