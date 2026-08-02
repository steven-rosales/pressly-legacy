import type { ChangeProductionAdmissionCommand } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type { ChangeProductionAdmission } from './change-production-admission.port.ts';

export const makeChangeProductionAdmissionController = (input: {
  changeAdmission: ChangeProductionAdmission;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.changeAdmission({
        ...(request.body as Omit<
          ChangeProductionAdmissionCommand,
          'locationId' | 'orderId'
        >),
        locationId: request.params['locationId'] as string,
        orderId: request.params['productionOrderId'] as string,
        actorId: input.readActorId(response),
      }),
    );
  });
