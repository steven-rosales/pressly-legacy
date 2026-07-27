import type { ChangeProductionOrderResolutionCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import { sendProductionResult } from '../http/production-response.ts';
import type { ChangeProductionOrderResolution } from './change-production-order-resolution.port.ts';

type ResolutionRequest =
  | Omit<
      Extract<
        ChangeProductionOrderResolutionCommand,
        { action: 'resolve_without_production' }
      >,
      'locationId' | 'orderId'
    >
  | Omit<
      Extract<ChangeProductionOrderResolutionCommand, { action: 'restore' }>,
      'locationId' | 'orderId'
    >;

export const makeChangeProductionOrderResolutionController = (input: {
  changeResolution: ChangeProductionOrderResolution;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    const body = request.body as ResolutionRequest;
    const scope = {
      locationId: request.params['locationId'] as string,
      orderId: request.params['productionOrderId'] as string,
      actorId: input.readActorId(response),
    };
    sendProductionResult(
      response,
      await (body.action === 'resolve_without_production'
        ? input.changeResolution({ ...body, ...scope })
        : input.changeResolution({ ...body, ...scope })),
    );
  });
