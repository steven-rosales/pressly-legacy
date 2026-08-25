import { z } from 'zod';

import {
  productionAlgorithmVersionSchema,
  productionStageKindSchema,
} from '../../../read-models/production-order/contract.ts';
export const productionLocationResourceInputSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    businessId: z.uuid(),
    name: z.string().trim().min(1).max(200),
    timezone: z.string().trim().min(1).max(100),
    isActive: z.boolean(),
  })
  .strict();

export const productionStationResourceInputSchema = z
  .object({
    locationId: z.string().trim().min(1).max(100),
    kind: productionStageKindSchema,
    label: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
  })
  .strict();

export const productionMachineResourceInputSchema = z
  .object({
    locationId: z.string().trim().min(1).max(100),
    stationKind: z.enum(['washing', 'drying']),
    label: z.string().trim().min(1).max(200),
    manufacturerCapacityLbs: z.number().positive().nullable(),
    effectiveCapacityLbs: z.number().positive().nullable(),
    capacitySafetyMarginLbs: z.number().nonnegative().nullable(),
    isActive: z.boolean(),
  })
  .strict()
  .superRefine((machine, context) => {
    if (machine.isActive && machine.effectiveCapacityLbs === null)
      context.addIssue({
        code: 'custom',
        path: ['effectiveCapacityLbs'],
        message: 'An active machine requires effective capacity.',
      });
  });

export const schedulerConfigResourceInputSchema = z
  .object({
    locationId: z.string().trim().min(1).max(100),
    pulseMinutes: z.number().int().positive(),
    foldLbsPerFolderMinute: z.number().positive(),
    algorithmVersion: productionAlgorithmVersionSchema,
    stageFitAssertion: z
      .object({
        sortingFits: z.literal(true),
        washingFits: z.literal(true),
        dryingFits: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const productionBootstrapManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    location: productionLocationResourceInputSchema,
    stations: z.array(productionStationResourceInputSchema).min(1),
    machines: z.array(productionMachineResourceInputSchema).min(1),
    schedulerConfig: schedulerConfigResourceInputSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const locationId = manifest.location.id;
    const scopedResources = [
      ...manifest.stations.map((resource, index) => ({
        locationId: resource.locationId,
        path: ['stations', index, 'locationId'] as const,
      })),
      ...manifest.machines.map((resource, index) => ({
        locationId: resource.locationId,
        path: ['machines', index, 'locationId'] as const,
      })),
      {
        locationId: manifest.schedulerConfig.locationId,
        path: ['schedulerConfig', 'locationId'] as const,
      },
    ];

    for (const resource of scopedResources)
      if (resource.locationId !== locationId)
        context.addIssue({
          code: 'custom',
          path: [...resource.path],
          message:
            'Every bootstrap resource must belong to the manifest location.',
        });

    const assertUnique = (
      values: readonly string[],
      path: 'stations' | 'machines',
    ): void => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value))
          context.addIssue({
            code: 'custom',
            path: [path, index],
            message: `Duplicate bootstrap natural key: ${value}.`,
          });
        seen.add(value);
      });
    };

    assertUnique(
      manifest.stations.map((station) => station.kind),
      'stations',
    );
    assertUnique(
      manifest.machines.map(
        (machine) => `${machine.stationKind}\u0000${machine.label}`,
      ),
      'machines',
    );
  });

export const productionBootstrapInputSchema = z
  .object({
    manifest: productionBootstrapManifestSchema,
    dryRun: z.boolean(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const productionBootstrapResourceTypeSchema = z.enum([
  'location',
  'station',
  'machine',
  'scheduler_config',
]);

export const productionBootstrapResourceChangeSchema = z
  .object({
    resourceType: productionBootstrapResourceTypeSchema,
    naturalKey: z.string().min(1).max(500),
    outcome: z.enum(['created', 'updated', 'noop']),
    changedFields: z.array(z.string().min(1).max(200)),
  })
  .strict()
  .superRefine((change, context) => {
    if (change.outcome === 'noop' && change.changedFields.length !== 0)
      context.addIssue({
        code: 'custom',
        path: ['changedFields'],
        message: 'A no-op resource cannot report changed fields.',
      });
    if (change.outcome !== 'noop' && change.changedFields.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['changedFields'],
        message: 'A created or updated resource must report changed fields.',
      });
  });

export const productionBootstrapDestructiveRejectionSchema = z
  .object({
    resourceType: productionBootstrapResourceTypeSchema,
    naturalKey: z.string().min(1).max(500),
    outcome: z.literal('rejected'),
    code: z.enum([
      'destructive_resource_removal',
      'destructive_resource_deactivation',
      'natural_key_change',
    ]),
    message: z.string().min(1).max(500),
  })
  .strict();

const productionBootstrapSummarySchema = z
  .object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    noop: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  })
  .strict();

const bootstrapResultFields = {
  mode: z.enum(['dry_run', 'apply']),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.array(productionBootstrapResourceChangeSchema),
  summary: productionBootstrapSummarySchema,
  replayed: z.boolean(),
} as const;

const validateBootstrapSummary = (
  result: {
    operations: readonly z.infer<
      typeof productionBootstrapResourceChangeSchema
    >[];
    rejections: readonly z.infer<
      typeof productionBootstrapDestructiveRejectionSchema
    >[];
    summary: z.infer<typeof productionBootstrapSummarySchema>;
  },
  context: z.RefinementCtx,
): void => {
  const count = (outcome: 'created' | 'updated' | 'noop'): number =>
    result.operations.filter((operation) => operation.outcome === outcome)
      .length;
  const expected = {
    created: count('created'),
    updated: count('updated'),
    noop: count('noop'),
    rejected: result.rejections.length,
  };

  if (JSON.stringify(result.summary) !== JSON.stringify(expected))
    context.addIssue({
      code: 'custom',
      path: ['summary'],
      message: 'Bootstrap summary counts do not match its resource outcomes.',
    });
};

export const productionBootstrapConvergedResultSchema = z
  .object({
    ...bootstrapResultFields,
    status: z.literal('converged'),
    rejections: z
      .array(productionBootstrapDestructiveRejectionSchema)
      .length(0),
    applied: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    validateBootstrapSummary(result, context);
    if (result.applied !== (result.mode === 'apply'))
      context.addIssue({
        code: 'custom',
        path: ['applied'],
        message: 'Only a converged apply result may report applied=true.',
      });
  });

export const productionBootstrapRejectedResultSchema = z
  .object({
    ...bootstrapResultFields,
    status: z.literal('rejected'),
    rejections: z.array(productionBootstrapDestructiveRejectionSchema).min(1),
    applied: z.literal(false),
  })
  .strict()
  .superRefine(validateBootstrapSummary);

export const productionBootstrapResultSchema = z.discriminatedUnion('status', [
  productionBootstrapConvergedResultSchema,
  productionBootstrapRejectedResultSchema,
]);

export type ProductionBootstrapInput = z.infer<
  typeof productionBootstrapInputSchema
>;
export type ProductionBootstrapResult = z.infer<
  typeof productionBootstrapResultSchema
>;

export type {
  ManageResourcesExpectedFailure,
  ManageResourcesResult,
  ProductionBootstrapManifest,
} from './types.ts';
