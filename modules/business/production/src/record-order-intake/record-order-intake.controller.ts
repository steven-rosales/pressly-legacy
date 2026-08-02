import type { RecordOrderIntakeCommand } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type { RecordOrderIntake } from './record-order-intake.port.ts';

export const makeRecordOrderIntakeController = (input: {
  recordIntake: RecordOrderIntake;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.recordIntake({
        ...(request.body as Omit<
          RecordOrderIntakeCommand,
          'locationId' | 'orderId'
        >),
        locationId: request.params['locationId'] as string,
        orderId: request.params['productionOrderId'] as string,
        actorId: input.readActorId(response),
      }),
    );
  });
