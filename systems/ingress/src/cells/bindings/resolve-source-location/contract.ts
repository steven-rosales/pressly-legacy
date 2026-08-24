import {
  defineBoundaryContract,
  defineCellContract,
  type DecodeResult,
} from '@pressly/cells';
import { z } from 'zod';
import {
  decodeIngressBoundary,
  noExpectedFailureBoundary,
} from '../../../model/boundary-contract.ts';
import type {
  ResolveSourceLocationExpectedFailure,
  ResolveSourceLocationInput,
  ResolveSourceLocationResult,
} from './types.ts';

const inputSchema = z
  .object({ source: z.string(), externalLocationId: z.string() })
  .strict();
const resultSchema = z.string().nullable();

export const resolveSourceLocationContract = defineCellContract<
  ResolveSourceLocationInput,
  ResolveSourceLocationResult,
  ResolveSourceLocationExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<ResolveSourceLocationInput> =>
      decodeIngressBoundary(inputSchema, serialized),
    encode: (value) => ({ ...value }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) => value,
  }),
  failure: noExpectedFailureBoundary('resolve-source-location'),
});
