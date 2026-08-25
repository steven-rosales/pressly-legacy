import { z } from 'zod';
import type { ResolveLocationAncestry } from './resolve-location-ancestry.usecase.ts';
import {
  defineAccessCellContract,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { noExpectedFailureSchema } from '../../../model/boundary/schemas.ts';

export const resolveLocationAncestryContract = defineAccessCellContract<
  OperationInput<ResolveLocationAncestry>,
  OperationOutput<ResolveLocationAncestry>,
  OperationFailure<ResolveLocationAncestry>
>({
  label: 'access.resolve-location-ancestry.v1',
  input: z.string(),
  output: z.object({ locationId: z.string(), businessId: z.string() }).strict(),
  failure: noExpectedFailureSchema,
});
