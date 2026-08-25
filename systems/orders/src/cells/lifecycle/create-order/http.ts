import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { validationError } from '@pressly/errors/factories';
import {
  createOrderHttpBodySchema,
  directOrderCustomer,
  orderManagementAuditContext,
  orderManagementBusinessId,
  orderManagementContextRequirements,
  orderManagementInvalidRequest,
  orderManagementLocationParamsSchema,
  orderMutationHttpResultSchema,
  parseOrderManagementRequest,
  presentOrderManagementOutcome,
  strictOrderManagementOutput,
} from '../../../model/order-management-http.ts';
import type { CreateOrderExpectedFailure } from './types.ts';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';

const validated = (request: Pick<HttpRequest, 'body' | 'params'>) => {
  const body = parseOrderManagementRequest(
    createOrderHttpBodySchema,
    request.body,
    'body',
  );
  const params = parseOrderManagementRequest(
    orderManagementLocationParamsSchema,
    request.params,
    'params',
  );
  if (body.fulfillment.locationId !== params.locationId)
    throw validationError({
      code: 'order_location_mismatch',
      message: 'The Order fulfillment location does not match the route.',
      safeMessage: 'The order location does not match this location.',
      status: 422,
    });
  return { body, params };
};

const serializedInput = (request: HttpRequest): unknown => {
  const { body } = validated(request);
  return {
    ...body,
    businessId: orderManagementBusinessId(request),
    context: orderManagementAuditContext(request),
    customer: directOrderCustomer(body.customer),
  };
};

export const presentCreateOrderHttp = (
  outcome: CellOutcome<OrderMutationResult, CreateOrderExpectedFailure>,
): HttpResponse =>
  presentOrderManagementOutcome(outcome, {
    status: 201,
    data: (value) =>
      strictOrderManagementOutput(
        orderMutationHttpResultSchema,
        value,
        'order_create_http_result_invalid',
      ),
  });

export const createOrderHttpSurfaces = Object.freeze([
  http.post<OrderMutationResult, CreateOrderExpectedFailure>({
    path: '/order-management/locations/:locationId/orders',
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
      validated(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: orderManagementLocationParamsSchema,
      input: (params) => ({ locationId: params['locationId'] }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present: presentCreateOrderHttp,
  }),
]) satisfies readonly HttpSurface<
  OrderMutationResult,
  CreateOrderExpectedFailure
>[];
