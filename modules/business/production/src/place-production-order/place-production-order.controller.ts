import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type {
  ConfirmProductionOrderOvertime,
  PlaceProductionOrderAutomatically,
  PlaceProductionOrderExactly,
} from './place-production-order.port.ts';

type ControllerInput = Readonly<{
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}>;

export const makePlaceProductionOrderAutomaticallyController = (
  input: ControllerInput & {
    place: PlaceProductionOrderAutomatically;
  },
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.place({
        locationId: request.params['locationId'] as string,
        productionRunId: request.params['productionRunId'] as string,
        productionOrderId: request.params['productionOrderId'] as string,
        expectedQueueVersion: request.body.expectedQueueVersion as number,
        idempotencyKey: request.body.idempotencyKey as string,
        actorId: input.readActorId(response),
        authorizedAction: 'production:override',
      }),
    );
  });

export const makePlaceProductionOrderExactlyController = (
  input: ControllerInput & { place: PlaceProductionOrderExactly },
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.place({
        locationId: request.params['locationId'] as string,
        productionRunId: request.params['productionRunId'] as string,
        productionBatchId: request.params['productionBatchId'] as string,
        productionOrderId: request.params['productionOrderId'] as string,
        expectedQueueVersion: request.body.expectedQueueVersion as number,
        expectedBatchVersion: request.body.expectedBatchVersion as number,
        idempotencyKey: request.body.idempotencyKey as string,
        actorId: input.readActorId(response),
        authorizedAction: 'production:override',
      }),
    );
  });

export const makeConfirmProductionOrderOvertimeController = (
  input: ControllerInput & { confirm: ConfirmProductionOrderOvertime },
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.confirm({
        locationId: request.params['locationId'] as string,
        productionRunId: request.params['productionRunId'] as string,
        productionOrderId: request.params['productionOrderId'] as string,
        expectedQueueVersion: request.body.expectedQueueVersion as number,
        proposalHash: request.body.proposalHash as string,
        idempotencyKey: request.body.idempotencyKey as string,
        actorId: input.readActorId(response),
        authorizedAction: 'production:override',
      }),
    );
  });
