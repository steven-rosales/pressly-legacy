import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  completeOrderHttpBodySchema,
  orderManagementAuditContext,
  orderManagementBusinessId,
  orderManagementContextRequirements,
  orderManagementInvalidRequest,
  orderManagementOrderParamsSchema,
  orderMutationHttpResultSchema,
  parseOrderManagementRequest,
  presentOrderManagementOutcome,
  strictOrderManagementOutput,
} from '../../../model/order-management-http.ts';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import type { CompleteOrderExpectedFailure } from './types.ts';

const serializedInput = (request: HttpRequest): unknown => {
  const params = parseOrderManagementRequest(
    orderManagementOrderParamsSchema,
    request.params,
    'params',
  );
  const body = parseOrderManagementRequest(
    completeOrderHttpBodySchema,
    request.body,
    'body',
  );
  return {
    ...body,
    businessId: orderManagementBusinessId(request),
    context: orderManagementAuditContext(request),
    locationId: params.locationId,
    orderId: params.orderId,
  };
};

export const presentCompleteOrderHttp = (
  outcome: CellOutcome<OrderMutationResult, CompleteOrderExpectedFailure>,
): HttpResponse =>
  presentOrderManagementOutcome(outcome, {
    status: 200,
    data: (value) =>
      strictOrderManagementOutput(
        orderMutationHttpResultSchema,
        value,
        'order_complete_http_result_invalid',
      ),
  });

export const completeOrderHttpSurfaces = Object.freeze([
  http.post<OrderMutationResult, CompleteOrderExpectedFailure>({
    path: '/order-management/locations/:locationId/orders/:orderId/complete',
    bodyLimit: '64kb',
    contextRequirements: [
      orderManagementContextRequirements.business,
      orderManagementContextRequirements.principal,
    ],
    invalidRequest: {
      authorizationScope: orderManagementInvalidRequest.params,
      input: orderManagementInvalidRequest.body,
    },
    validateRequest: (request) => {
      parseOrderManagementRequest(
        completeOrderHttpBodySchema,
        request.body,
        'body',
      );
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: orderManagementOrderParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        orderId: params['orderId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present: presentCompleteOrderHttp,
  }),
]) satisfies readonly HttpSurface<
  OrderMutationResult,
  CompleteOrderExpectedFailure
>[];
