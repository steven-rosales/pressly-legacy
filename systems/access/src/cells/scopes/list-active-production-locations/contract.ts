import { z } from 'zod';
import {
  defineAccessCellContract,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { noExpectedFailureSchema } from '../../../model/boundary/schemas.ts';
import type { ListActiveProductionLocations } from './list-active-production-locations.usecase.ts';

export const listActiveProductionLocationsContract = defineAccessCellContract<
  OperationInput<ListActiveProductionLocations>,
  OperationOutput<ListActiveProductionLocations>,
  OperationFailure<ListActiveProductionLocations>
>({
  label: 'access.list-active-production-locations.v1',
  input: z.null(),
  output: z
    .object({
      locations: z.array(
        z
          .object({
            id: z.string(),
            businessId: z.string(),
            name: z.string(),
            timezone: z.string(),
          })
          .strict(),
      ),
    })
    .strict(),
  failure: noExpectedFailureSchema,
});
