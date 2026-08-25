import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  cancelOrderHttpBodySchema,
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
import type { CancelOrderExpectedFailure } from './types.ts';

const serializedInput = (request: HttpRequest): unknown => {
  const params = parseOrderManagementRequest(
    orderManagementOrderParamsSchema,
    request.params,
    'params',
  );
  const body = parseOrderManagementRequest(
    cancelOrderHttpBodySchema,
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

export const presentCancelOrderHttp = (
  outcome: CellOutcome<OrderMutationResult, CancelOrderExpectedFailure>,
): HttpResponse =>
  presentOrderManagementOutcome(outcome, {
    status: 200,
    data: (value) =>
      strictOrderManagementOutput(
        orderMutationHttpResultSchema,
        value,
        'order_cancel_http_result_invalid',
      ),
  });

export const cancelOrderHttpSurfaces = Object.freeze([
  http.post<OrderMutationResult, CancelOrderExpectedFailure>({
    path: '/order-management/locations/:locationId/orders/:orderId/cancel',
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
        cancelOrderHttpBodySchema,
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
    present: presentCancelOrderHttp,
  }),
]) satisfies readonly HttpSurface<
  OrderMutationResult,
  CancelOrderExpectedFailure
>[];
