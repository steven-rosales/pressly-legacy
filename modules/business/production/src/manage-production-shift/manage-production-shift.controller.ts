import type { RequestHandler } from 'express';
import type { CreateProductionShiftCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { CreateProductionShift } from './manage-production-shift.port.ts';

export const makeCreateProductionShiftController = (input: {
  create: CreateProductionShift;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.create({
        ...(request.body as Omit<CreateProductionShiftCommand, 'locationId'>),
        locationId: request.params['locationId'] as string,
        actorId: input.readActorId(response),
      }),
      201,
    );
  });
