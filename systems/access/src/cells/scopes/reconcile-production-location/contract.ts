import { z } from 'zod';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
} from '../../../model/boundary/cell-contract.ts';
import { noExpectedFailureSchema } from '../../../model/boundary/schemas.ts';
import type {
  ReconcileProductionLocationCommand,
  ReconcileProductionLocationResult,
} from './types.ts';

const locationSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    businessId: z.uuid(),
    name: z.string().trim().min(1).max(200),
    timezone: z.string().trim().min(1).max(100),
    isActive: z.boolean(),
  })
  .strict();

const operationSchema = z
  .object({
    resourceType: z.literal('location'),
    naturalKey: z.string(),
    outcome: z.enum(['created', 'updated', 'noop']),
    changedFields: z.array(z.string()),
  })
  .strict();

const rejectionSchema = z
  .object({
    resourceType: z.literal('location'),
    naturalKey: z.string(),
    outcome: z.literal('rejected'),
    code: z.enum([
      'business_not_found',
      'destructive_resource_deactivation',
      'natural_key_change',
    ]),
    message: z.string(),
  })
  .strict();

const resultSchema: z.ZodType<ReconcileProductionLocationResult> =
  z.discriminatedUnion('status', [
    z
      .object({
        mode: z.enum(['apply', 'dry_run']),
        status: z.literal('converged'),
        operation: operationSchema,
        applied: z.boolean(),
        rejections: z.tuple([]),
      })
      .strict(),
    z
      .object({
        mode: z.enum(['apply', 'dry_run']),
        status: z.literal('rejected'),
        operation: z.null(),
        applied: z.literal(false),
        rejections: z.tuple([rejectionSchema]),
      })
      .strict(),
  ]);

export const reconcileProductionLocationContract = defineAccessCellContract<
  ReconcileProductionLocationCommand,
  ReconcileProductionLocationResult,
  never
>({
  label: 'access.reconcile-production-location.v1',
  input: exactOptionalContractSchema<ReconcileProductionLocationCommand>(
    z.object({ location: locationSchema, dryRun: z.boolean() }).strict(),
  ),
  output: resultSchema,
  failure: noExpectedFailureSchema,
});
