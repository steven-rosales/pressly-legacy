import { z } from 'zod';
import {
  defineAccessCellContract,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { noExpectedFailureSchema } from '../../../model/boundary/schemas.ts';
import type { ListActiveBusinessLocations } from './list-active-business-locations.usecase.ts';

export const listActiveBusinessLocationsContract = defineAccessCellContract<
  OperationInput<ListActiveBusinessLocations>,
  OperationOutput<ListActiveBusinessLocations>,
  OperationFailure<ListActiveBusinessLocations>
>({
  label: 'access.list-active-business-locations.v1',
  input: z.string(),
  output: z
    .object({
      locations: z.array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            timezone: z.string(),
          })
          .strict(),
      ),
    })
    .strict(),
  failure: noExpectedFailureSchema,
});
