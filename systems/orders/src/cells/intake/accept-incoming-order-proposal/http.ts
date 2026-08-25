import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  acceptIncomingOrderProposalHttpBodySchema,
  incomingOrderProposalDecisionHttpResultSchema,
  orderManagementAuditContext,
  orderManagementContextRequirements,
  orderManagementInvalidRequest,
  orderManagementProposalParamsSchema,
  parseOrderManagementRequest,
  presentOrderManagementOutcome,
  strictOrderManagementOutput,
} from '../../../model/order-management-http.ts';
import type { AcceptIncomingOrderProposalExpectedFailure } from './types.ts';
import type { IncomingOrderProposalDecisionResult } from '../../../model/incoming-order-proposal/model.ts';

const serializedInput = (request: HttpRequest): unknown => {
  const params = parseOrderManagementRequest(
    orderManagementProposalParamsSchema,
    request.params,
    'params',
  );
  const body = parseOrderManagementRequest(
    acceptIncomingOrderProposalHttpBodySchema,
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

export const presentAcceptIncomingOrderProposalHttp = (
  outcome: CellOutcome<
    IncomingOrderProposalDecisionResult,
    AcceptIncomingOrderProposalExpectedFailure
  >,
): HttpResponse =>
  presentOrderManagementOutcome(outcome, {
    status: 200,
    data: (value) =>
      strictOrderManagementOutput(
        incomingOrderProposalDecisionHttpResultSchema,
        value,
        'incoming_order_proposal_accept_http_result_invalid',
      ),
  });

export const acceptIncomingOrderProposalHttpSurfaces = Object.freeze([
  http.post<
    IncomingOrderProposalDecisionResult,
    AcceptIncomingOrderProposalExpectedFailure
  >({
    path: '/order-management/locations/:locationId/incoming-orders/:proposalId/accept',
    bodyLimit: '64kb',
    contextRequirements: [orderManagementContextRequirements.principal],
    invalidRequest: {
      authorizationScope: orderManagementInvalidRequest.params,
      input: orderManagementInvalidRequest.body,
    },
    validateRequest: (request) => {
      parseOrderManagementRequest(
        acceptIncomingOrderProposalHttpBodySchema,
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
    present: presentAcceptIncomingOrderProposalHttp,
  }),
]) satisfies readonly HttpSurface<
  IncomingOrderProposalDecisionResult,
  AcceptIncomingOrderProposalExpectedFailure
>[];
