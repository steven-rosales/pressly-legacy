import type { RequestHandler } from 'express';
import type {
  CreateProductionShiftCommand,
  UpdateProductionShiftCommand,
} from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { CreateProductionShift } from './manage-production-shift.port.ts';
import type { UpdateProductionShift } from './manage-production-shift.port.ts';

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

export const makeUpdateProductionShiftController = (input: {
  update: UpdateProductionShift;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.update({
        ...(request.body as Omit<
          UpdateProductionShiftCommand,
          'locationId' | 'productionShiftId'
        >),
        locationId: request.params['locationId'] as string,
        productionShiftId: request.params['productionShiftId'] as string,
        actorId: input.readActorId(response),
      }),
    );
  });
