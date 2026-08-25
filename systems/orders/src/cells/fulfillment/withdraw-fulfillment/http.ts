import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  orderManagementAuditContext,
  orderManagementBusinessId,
  orderManagementContextRequirements,
  orderManagementFulfillmentParamsSchema,
  orderManagementInvalidRequest,
  orderMutationHttpResultSchema,
  parseOrderManagementRequest,
  presentOrderManagementOutcome,
  strictOrderManagementOutput,
  withdrawFulfillmentHttpBodySchema,
} from '../../../model/order-management-http.ts';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import type { WithdrawFulfillmentExpectedFailure } from './types.ts';

const serializedInput = (request: HttpRequest): unknown => {
  const params = parseOrderManagementRequest(
    orderManagementFulfillmentParamsSchema,
    request.params,
    'params',
  );
  const body = parseOrderManagementRequest(
    withdrawFulfillmentHttpBodySchema,
    request.body,
    'body',
  );
  return {
    ...body,
    businessId: orderManagementBusinessId(request),
    context: orderManagementAuditContext(request),
    locationId: params.locationId,
    fulfillmentId: params.fulfillmentId,
  };
};

export const presentWithdrawFulfillmentHttp = (
  outcome: CellOutcome<OrderMutationResult, WithdrawFulfillmentExpectedFailure>,
): HttpResponse =>
  presentOrderManagementOutcome(outcome, {
    status: 200,
    data: (value) =>
      strictOrderManagementOutput(
        orderMutationHttpResultSchema,
        value,
        'fulfillment_withdraw_http_result_invalid',
      ),
  });

export const withdrawFulfillmentHttpSurfaces = Object.freeze([
  http.post<OrderMutationResult, WithdrawFulfillmentExpectedFailure>({
    path: '/order-management/locations/:locationId/fulfillments/:fulfillmentId/withdraw',
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
        withdrawFulfillmentHttpBodySchema,
        request.body,
        'body',
      );
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: orderManagementFulfillmentParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        fulfillmentId: params['fulfillmentId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present: presentWithdrawFulfillmentHttp,
  }),
]) satisfies readonly HttpSurface<
  OrderMutationResult,
  WithdrawFulfillmentExpectedFailure
>[];
