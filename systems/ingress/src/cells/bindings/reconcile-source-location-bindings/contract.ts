import {
  defineBoundaryContract,
  defineCellContract,
  type DecodeResult,
} from '@pressly/cells';
import { z } from 'zod';
import {
  decodeIngressBoundary,
  encodeIngressBoundary,
  noExpectedFailureBoundary,
} from '../../../model/boundary-contract.ts';
import type { ReconcileSourceLocationBindingsResult } from './model.ts';
import type {
  ReconcileSourceLocationBindingsCommand,
  ReconcileSourceLocationBindingsExpectedFailure,
} from './types.ts';

const bindingSchema = z
  .object({
    source: z.string(),
    externalLocationId: z.string(),
    locationId: z.string(),
    isActive: z.boolean(),
  })
  .strict();
const commandSchema = z
  .object({
    manifest: z
      .object({ sourceLocationBindings: z.array(bindingSchema) })
      .strict(),
    dryRun: z.boolean(),
  })
  .strict();
const operationSchema = z
  .object({
    source: z.string(),
    externalLocationId: z.string(),
    locationId: z.string(),
    outcome: z.enum(['created', 'noop']),
  })
  .strict();
const rejectionSchema = z
  .object({
    source: z.string(),
    externalLocationId: z.string(),
    code: z.enum([
      'binding_location_change',
      'binding_deactivation',
      'binding_removal',
    ]),
    message: z.string(),
  })
  .strict();
const outputSchema = z
  .object({
    mode: z.enum(['dry_run', 'apply']),
    status: z.enum(['converged', 'rejected']),
    applied: z.boolean(),
    operations: z.array(operationSchema),
    rejections: z.array(rejectionSchema),
  })
  .strict();

export const reconcileSourceLocationBindingsContract = defineCellContract<
  ReconcileSourceLocationBindingsCommand,
  ReconcileSourceLocationBindingsResult,
  ReconcileSourceLocationBindingsExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (
      serialized,
    ): DecodeResult<ReconcileSourceLocationBindingsCommand> =>
      decodeIngressBoundary(commandSchema, serialized),
    encode: (value) => ({
      manifest: {
        sourceLocationBindings: value.manifest.sourceLocationBindings.map(
          (binding) => ({ ...binding }),
        ),
      },
      dryRun: value.dryRun,
    }),
  }),
  output: defineBoundaryContract<ReconcileSourceLocationBindingsResult>({
    version: 1,
    decode: (serialized) => {
      const decoded = decodeIngressBoundary(outputSchema, serialized);
      return decoded.kind === 'invalid'
        ? decoded
        : {
            kind: 'valid',
            value: {
              ...decoded.value,
              operations: Object.freeze(decoded.value.operations),
              rejections: Object.freeze(decoded.value.rejections),
            },
          };
    },
    encode: (value) =>
      encodeIngressBoundary(
        outputSchema,
        {
          ...value,
          operations: value.operations.map((operation) => ({ ...operation })),
          rejections: value.rejections.map((rejection) => ({ ...rejection })),
        },
        {
          code: 'ingress_binding_reconciliation_result_invalid',
          message:
            'A source-location reconciliation result violated its boundary contract.',
        },
      ),
  }),
  failure: noExpectedFailureBoundary('reconcile-source-location-bindings'),
});
