import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  incomingOrderProposalHttpListQuerySchema,
  incomingOrderProposalListHttpResultSchema,
  orderManagementInvalidRequest,
  orderManagementLocationParamsSchema,
  parseOrderManagementRequest,
  presentOrderManagementOutcome,
  strictOrderManagementOutput,
} from '../../../model/order-management-http.ts';
import type {
  IncomingOrderProposalListResult,
  ListIncomingOrderProposalsExpectedFailure,
} from './types.ts';

const serializedInput = (request: HttpRequest): unknown => {
  const query = parseOrderManagementRequest(
    incomingOrderProposalHttpListQuerySchema,
    request.query,
    'query',
  );
  const params = parseOrderManagementRequest(
    orderManagementLocationParamsSchema,
    request.params,
    'params',
  );
  return {
    locationId: params.locationId,
    limit: query.limit,
    cursor: query.cursor ?? null,
    view: query.view,
  };
};

export const presentListIncomingOrderProposalsHttp = (
  outcome: CellOutcome<
    IncomingOrderProposalListResult,
    ListIncomingOrderProposalsExpectedFailure
  >,
): HttpResponse =>
  presentOrderManagementOutcome(outcome, {
    status: 200,
    data: (value) =>
      strictOrderManagementOutput(
        incomingOrderProposalListHttpResultSchema,
        {
          ...value,
          items: value.items.map((proposal) => ({
            ...proposal,
            dueAt: proposal.dueAt.toISOString(),
            sourceReportedAt: proposal.sourceReportedAt.toISOString(),
            reportedAt: proposal.reportedAt.toISOString(),
            sourceClosure:
              proposal.sourceClosure === null
                ? null
                : {
                    ...proposal.sourceClosure,
                    observedAt: proposal.sourceClosure.observedAt.toISOString(),
                  },
          })),
        },
        'incoming_order_proposal_list_http_result_invalid',
      ),
  });

export const listIncomingOrderProposalsHttpSurfaces = Object.freeze([
  http.get<
    IncomingOrderProposalListResult,
    ListIncomingOrderProposalsExpectedFailure
  >({
    path: '/order-management/locations/:locationId/incoming-orders',
    bodyLimit: '64kb',
    invalidRequest: {
      authorizationScope: orderManagementInvalidRequest.params,
      input: orderManagementInvalidRequest.query,
    },
    validateRequest: (request) => {
      parseOrderManagementRequest(
        incomingOrderProposalHttpListQuerySchema,
        request.query,
        'query',
      );
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: orderManagementLocationParamsSchema,
      input: (params) => ({ locationId: params['locationId'] }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present: presentListIncomingOrderProposalsHttp,
  }),
]) satisfies readonly HttpSurface<
  IncomingOrderProposalListResult,
  ListIncomingOrderProposalsExpectedFailure
>[];
