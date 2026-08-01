import type {
  CommitProductionOrderRouteRequest,
  PreviewProductionOrderRouteRequest,
} from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import { sendProductionResult } from '../http/production-response.ts';
import type {
  CommitProductionOrderRoute,
  PreviewProductionOrderRoute,
} from './route-production-order.port.ts';

type ControllerInput = Readonly<{
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}>;

const routingIdentity = (
  request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
  input: ControllerInput,
) => ({
  locationId: request.params['locationId'] as string,
  productionRunId: request.params['productionRunId'] as string,
  productionOrderId: request.params['productionOrderId'] as string,
  actorId: input.readActorId(response),
  authorizedAction: 'production:stage' as const,
});

export const makePreviewProductionOrderRouteController = (
  input: ControllerInput & { preview: PreviewProductionOrderRoute },
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.preview({
        ...(request.body as PreviewProductionOrderRouteRequest),
        ...routingIdentity(request, response, input),
      }),
    );
  });

export const makeCommitProductionOrderRouteController = (
  input: ControllerInput & { commit: CommitProductionOrderRoute },
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.commit({
        ...(request.body as CommitProductionOrderRouteRequest),
        ...routingIdentity(request, response, input),
      }),
    );
  });
