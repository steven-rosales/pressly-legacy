import type { ListProductionLocationsQuery } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { RequestHandler, Response } from 'express';
import { sendProductionResult } from '../http/production-response.ts';
import type { ListProductionLocations } from './list-production-locations.port.ts';

export const makeListProductionLocationsController = (input: {
  listLocations: ListProductionLocations;
  readAllowedLocationIds: (
    response: Response,
  ) => Promise<readonly string[] | null>;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    const allowedLocationIds = await input.readAllowedLocationIds(response);
    sendProductionResult(
      response,
      await input.listLocations({
        ...(request.query as unknown as ListProductionLocationsQuery),
        allowedLocationIds,
      }),
    );
  });
