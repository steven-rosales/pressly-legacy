import {
  listProductionLocationsQuerySchema,
  listProductionLocationsResultSchema,
} from './list-production-locations.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler, Response } from 'express';
import { toListProductionLocationsResult } from './list-production-locations.contract.mapper.ts';
import type { ListProductionLocations } from './list-production-locations.port.ts';

export const listProductionLocationsBoundary = defineRequestBoundary({
  query: listProductionLocationsQuerySchema,
});

export const makeListProductionLocationsController = (input: {
  listLocations: ListProductionLocations;
  readAllowedLocationIds: (
    response: Response,
  ) => Promise<readonly string[] | null>;
}): RequestHandler =>
  listProductionLocationsBoundary.handler(async ({ query }, { response }) => {
    const allowedLocationIds = await input.readAllowedLocationIds(response);
    sendValidatedProductionResult(
      response,
      await input.listLocations({
        includeInactive: query.includeInactive,
        allowedLocationIds,
      }),
      {
        schema: listProductionLocationsResultSchema,
        present: toListProductionLocationsResult,
      },
    );
  });
