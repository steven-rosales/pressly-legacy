import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  correctOrderHttpBodySchema,
  directOrderCustomer,
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
import type { CorrectOrderExpectedFailure } from './types.ts';

const serializedInput = (request: HttpRequest): unknown => {
  const params = parseOrderManagementRequest(
    orderManagementOrderParamsSchema,
    request.params,
    'params',
  );
  const body = parseOrderManagementRequest(
    correctOrderHttpBodySchema,
    request.body,
    'body',
  );
  return {
    businessId: orderManagementBusinessId(request),
    idempotencyKey: body.idempotencyKey,
    context: orderManagementAuditContext(request),
    reasonCode: body.reasonCode,
    reasonNote: body.reasonNote,
    expectedOrderVersion: body.expectedOrderVersion,
    expectedFulfillmentVersion: body.expectedFulfillmentVersion,
    locationId: params.locationId,
    orderId: params.orderId,
    changes: {
      ...body.changes,
      ...(body.changes.customer === undefined
        ? {}
        : { customer: directOrderCustomer(body.changes.customer) }),
    },
  };
};

export const presentCorrectOrderHttp = (
  outcome: CellOutcome<OrderMutationResult, CorrectOrderExpectedFailure>,
): HttpResponse =>
  presentOrderManagementOutcome(outcome, {
    status: 200,
    data: (value) =>
      strictOrderManagementOutput(
        orderMutationHttpResultSchema,
        value,
        'order_correction_http_result_invalid',
      ),
  });

export const correctOrderHttpSurfaces = Object.freeze([
  http.patch<OrderMutationResult, CorrectOrderExpectedFailure>({
    path: '/order-management/locations/:locationId/orders/:orderId',
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
        correctOrderHttpBodySchema,
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
    present: presentCorrectOrderHttp,
  }),
]) satisfies readonly HttpSurface<
  OrderMutationResult,
  CorrectOrderExpectedFailure
>[];
