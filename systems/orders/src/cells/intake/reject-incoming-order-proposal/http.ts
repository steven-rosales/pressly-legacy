import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  incomingOrderProposalDecisionHttpResultSchema,
  orderManagementAuditContext,
  orderManagementContextRequirements,
  orderManagementInvalidRequest,
  orderManagementProposalParamsSchema,
  parseOrderManagementRequest,
  presentOrderManagementOutcome,
  rejectIncomingOrderProposalHttpBodySchema,
  strictOrderManagementOutput,
} from '../../../model/order-management-http.ts';
import type { RejectIncomingOrderProposalExpectedFailure } from './types.ts';
import type { IncomingOrderProposalDecisionResult } from '../../../model/incoming-order-proposal/model.ts';

const serializedInput = (request: HttpRequest): unknown => {
  const params = parseOrderManagementRequest(
    orderManagementProposalParamsSchema,
    request.params,
    'params',
  );
  const body = parseOrderManagementRequest(
    rejectIncomingOrderProposalHttpBodySchema,
    request.body,
    'body',
  );
  return {
    ...body,
    proposalId: params.proposalId,
    locationId: params.locationId,
    context: orderManagementAuditContext(request),
  };
};

export const presentRejectIncomingOrderProposalHttp = (
  outcome: CellOutcome<
    IncomingOrderProposalDecisionResult,
    RejectIncomingOrderProposalExpectedFailure
  >,
): HttpResponse =>
  presentOrderManagementOutcome(outcome, {
    status: 200,
    data: (value) =>
      strictOrderManagementOutput(
        incomingOrderProposalDecisionHttpResultSchema,
        value,
        'incoming_order_proposal_reject_http_result_invalid',
      ),
  });

export const rejectIncomingOrderProposalHttpSurfaces = Object.freeze([
  http.post<
    IncomingOrderProposalDecisionResult,
    RejectIncomingOrderProposalExpectedFailure
  >({
    path: '/order-management/locations/:locationId/incoming-orders/:proposalId/reject',
    bodyLimit: '64kb',
    contextRequirements: [orderManagementContextRequirements.principal],
    invalidRequest: {
      authorizationScope: orderManagementInvalidRequest.params,
      input: orderManagementInvalidRequest.body,
    },
    validateRequest: (request) => {
      parseOrderManagementRequest(
        rejectIncomingOrderProposalHttpBodySchema,
        request.body,
        'body',
      );
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: orderManagementProposalParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        proposalId: params['proposalId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present: presentRejectIncomingOrderProposalHttp,
  }),
]) satisfies readonly HttpSurface<
  IncomingOrderProposalDecisionResult,
  RejectIncomingOrderProposalExpectedFailure
>[];
