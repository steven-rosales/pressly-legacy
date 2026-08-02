import type { ListProductionLocationsQuery } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler, Response } from 'express';
import type { ListProductionLocations } from './list-production-locations.port.ts';

export const makeListProductionLocationsController = (input: {
  listLocations: ListProductionLocations;
  readAllowedLocationIds: (
    response: Response,
  ) => Promise<readonly string[] | null>;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    const allowedLocationIds = await input.readAllowedLocationIds(response);
    sendApiResult(
      response,
      await input.listLocations({
        ...(request.query as unknown as ListProductionLocationsQuery),
        allowedLocationIds,
      }),
    );
  });
