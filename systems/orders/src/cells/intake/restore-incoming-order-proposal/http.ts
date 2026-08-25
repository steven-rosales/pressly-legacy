import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  orderManagementAuditContext,
  orderManagementContextRequirements,
  orderManagementInvalidRequest,
  orderManagementProposalParamsSchema,
  parseOrderManagementRequest,
  presentOrderManagementOutcome,
  restoreIncomingOrderProposalHttpBodySchema,
  restoreIncomingOrderProposalHttpResultSchema,
  strictOrderManagementOutput,
} from '../../../model/order-management-http.ts';
import type {
  RestoreIncomingOrderProposalExpectedFailure,
  RestoreIncomingOrderProposalResult,
} from './types.ts';

const serializedInput = (request: HttpRequest): unknown => {
  const params = parseOrderManagementRequest(
    orderManagementProposalParamsSchema,
    request.params,
    'params',
  );
  const body = parseOrderManagementRequest(
    restoreIncomingOrderProposalHttpBodySchema,
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

export const presentRestoreIncomingOrderProposalHttp = (
  outcome: CellOutcome<
    RestoreIncomingOrderProposalResult,
    RestoreIncomingOrderProposalExpectedFailure
  >,
): HttpResponse =>
  presentOrderManagementOutcome(outcome, {
    status: 200,
    data: (value) =>
      strictOrderManagementOutput(
        restoreIncomingOrderProposalHttpResultSchema,
        value,
        'incoming_order_proposal_restore_http_result_invalid',
      ),
  });

export const restoreIncomingOrderProposalHttpSurfaces = Object.freeze([
  http.post<
    RestoreIncomingOrderProposalResult,
    RestoreIncomingOrderProposalExpectedFailure
  >({
    path: '/order-management/locations/:locationId/incoming-orders/:proposalId/restore',
    bodyLimit: '64kb',
    contextRequirements: [orderManagementContextRequirements.principal],
    invalidRequest: {
      authorizationScope: orderManagementInvalidRequest.params,
      input: orderManagementInvalidRequest.body,
    },
    validateRequest: (request) => {
      parseOrderManagementRequest(
        restoreIncomingOrderProposalHttpBodySchema,
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
    present: presentRestoreIncomingOrderProposalHttp,
  }),
]) satisfies readonly HttpSurface<
  RestoreIncomingOrderProposalResult,
  RestoreIncomingOrderProposalExpectedFailure
>[];
