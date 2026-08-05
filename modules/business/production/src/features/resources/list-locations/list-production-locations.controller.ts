import {
  listProductionLocationsQuerySchema,
  listProductionLocationsResultSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { Response } from 'express';
import { toListProductionLocationsResult } from './list-production-locations.contract.mapper.ts';
import type { ListProductionLocations } from './list-production-locations.port.ts';

export const makeListProductionLocationsController = (input: {
  listLocations: ListProductionLocations;
  readAllowedLocationIds: (
    response: Response,
  ) => Promise<readonly string[] | null>;
}) =>
  defineValidatedController({
    request: { query: listProductionLocationsQuerySchema },
    handle: async ({ query }, { response }) => {
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
    },
  });
