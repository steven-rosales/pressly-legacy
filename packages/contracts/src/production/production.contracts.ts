import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

export const productionIdSchema = z.uuid();
export const productionStageKindSchema = z.enum([
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
]);
export const productionDueBucketSchema = z.enum(['today', 'tomorrow', 'later']);
export const productionOrderStatusSchema = z.enum([
  'intake_pending',
  'eligible',
  'ineligible',
  'scheduled',
  'finished',
]);
export const productionBagCountProvenanceSchema = z.enum([
  'external_source',
  'operator_intake',
]);
export const productionWarningCodeSchema = z.enum([
  'SHIFT_OVERFLOW',
  'OVERSIZED_ORDER',
  'NO_ACTIVE_WASHERS',
  'NO_ACTIVE_DRYERS',
  'NO_FOLDING_CAPACITY',
]);

export const productionWarningSchema = z
  .object({
    code: productionWarningCodeSchema,
    message: z.string().min(1),
    blocking: z.boolean(),
    orderIds: z.array(productionIdSchema).optional(),
  })
  .strict();

export const productionOrderSummarySchema = z
  .object({
    id: productionIdSchema,
    externalOrderId: z.string().min(1),
    dueAt: utcIsoStringSchema,
    dueBucket: productionDueBucketSchema,
    priority: z.boolean(),
    derivedWeightLbs: z.number().positive(),
    bagCount: z.number().int().nonnegative(),
    version: z.number().int().positive(),
  })
  .strict();

export const productionOrderListItemSchema = z
  .object({
    id: productionIdSchema,
    locationId: z.string().min(1),
    externalOrderId: z.string().min(1),
    dueAt: utcIsoStringSchema,
    dueBucket: productionDueBucketSchema,
    priority: z.boolean(),
    status: productionOrderStatusSchema,
    derivedWeightLbs: z.number().positive(),
    bagCount: z.number().int().nonnegative().nullable(),
    bagCountProvenance: productionBagCountProvenanceSchema.nullable(),
    intakeVersion: z.number().int().positive().nullable(),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((order, context) => {
    if ((order.bagCount === null) !== (order.bagCountProvenance === null))
      context.addIssue({
        code: 'custom',
        path: ['bagCountProvenance'],
        message:
          'Bag count and provenance must either both exist or both be null.',
      });

    if ((order.bagCount === null) !== (order.intakeVersion === null))
      context.addIssue({
        code: 'custom',
        path: ['intakeVersion'],
        message:
          'Bag count and intake version must either both exist or both be null.',
      });

    if (order.status === 'intake_pending' && order.bagCount !== null)
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'An intake-pending order cannot have a recorded bag count.',
      });

    if (order.status !== 'intake_pending' && order.bagCount === null)
      context.addIssue({
        code: 'custom',
        path: ['bagCount'],
        message: 'A schedulable or processed order requires bag intake.',
      });
  });

export const productionLocationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    timezone: z.string().min(1),
    isActive: z.boolean(),
  })
  .strict();

export const productionStationSchema = z
  .object({
    id: productionIdSchema,
    locationId: z.string().min(1),
    kind: productionStageKindSchema,
    label: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
  })
  .strict();

export const productionMachineSchema = z
  .object({
    id: productionIdSchema,
    stationKind: z.enum(['washing', 'drying']),
    label: z.string().min(1),
    effectiveCapacityLbs: z.number().positive(),
    active: z.boolean(),
  })
  .strict();

export const productionShiftSchema = z
  .object({
    id: productionIdSchema,
    locationId: z.string().min(1),
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    effectiveFolderCount: z.number().int().positive(),
    status: z.enum(['draft', 'open', 'closed']),
    version: z.number().int().positive(),
  })
  .strict();

export const schedulerConfigSchema = z
  .object({
    id: productionIdSchema,
    pulseMinutes: z.number().int().positive(),
    foldLbsPerFolderMinute: z.number().positive(),
    algorithmVersion: z.literal('fixed-pulse-ffd-v1'),
    version: z.number().int().positive(),
    stageFitAssertion: z
      .object({
        sortingFits: z.literal(true),
        washingFits: z.literal(true),
        dryingFits: z.literal(true),
        assertedBy: productionIdSchema,
        assertedAt: utcIsoStringSchema,
      })
      .strict(),
    publishedAt: utcIsoStringSchema,
  })
  .strict();

export const plannedStageSchema = z
  .object({
    stage: productionStageKindSchema,
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    machineIds: z.array(productionIdSchema),
  })
  .strict();

export const proposedBatchSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    orderIds: z.array(productionIdSchema).min(1),
    derivedWeightLbs: z.number().positive(),
    bagCount: z.number().int().nonnegative(),
    stages: z.array(plannedStageSchema).length(4),
  })
  .strict();

export const scheduleProposalSchema = z
  .object({
    scheduleRunId: productionIdSchema,
    productionShiftId: productionIdSchema,
    schedulerConfigId: productionIdSchema,
    status: z.enum(['draft', 'accepted', 'superseded', 'rejected']),
    inputSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    outputPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
    algorithmVersion: z.literal('fixed-pulse-ffd-v1'),
    pulseMinutes: z.number().int().positive(),
    pulseCapacityLbs: z.number().positive(),
    batchCount: z.number().int().nonnegative(),
    makespanMinutes: z.number().int().nonnegative(),
    plannedCompletionAt: utcIsoStringSchema,
    batches: z.array(proposedBatchSchema),
    unplacedOrderIds: z.array(productionIdSchema),
    warnings: z.array(productionWarningSchema),
    createdAt: utcIsoStringSchema,
    acceptedAt: utcIsoStringSchema.nullable(),
  })
  .strict();

export const stageRunSchema = z
  .object({
    id: productionIdSchema,
    productionBatchId: productionIdSchema,
    stage: productionStageKindSchema,
    status: z.enum(['planned', 'started', 'completed']),
    plannedStartAt: utcIsoStringSchema,
    plannedEndAt: utcIsoStringSchema,
    actualStartAt: utcIsoStringSchema.nullable(),
    actualEndAt: utcIsoStringSchema.nullable(),
    machineIds: z.array(productionIdSchema),
    allowedActions: z.array(z.enum(['start', 'complete'])),
    version: z.number().int().positive(),
  })
  .strict();

export const productionBatchSchema = z
  .object({
    id: productionIdSchema,
    sequence: z.number().int().nonnegative(),
    status: z.enum([
      'queued',
      'sorting',
      'washing',
      'drying',
      'folding_packaging',
      'finished',
    ]),
    derivedWeightLbs: z.number().positive(),
    pulseCapacityLbs: z.number().positive(),
    pulseMinutes: z.number().int().positive(),
    orders: z.array(productionOrderSummarySchema).min(1),
    stages: z.array(stageRunSchema).length(4),
    version: z.number().int().positive(),
  })
  .strict();

export const productionBoardSchema = z
  .object({
    productionShift: productionShiftSchema,
    productionRun: z
      .object({
        id: productionIdSchema,
        status: z.enum(['planned', 'started', 'completed']),
        allowedActions: z.array(z.literal('start')),
        version: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    batches: z.array(productionBatchSchema),
    eligibleOrders: z.array(productionOrderSummarySchema),
    asOf: utcIsoStringSchema,
  })
  .strict();

export const productionRunSummarySchema = z
  .object({
    id: productionIdSchema,
    productionShiftId: productionIdSchema,
    status: z.enum(['planned', 'started', 'completed']),
    version: z.number().int().positive(),
  })
  .strict();

export const productionWorkspaceSchema = z
  .object({
    location: productionLocationSchema,
    currentShift: productionShiftSchema.nullable(),
    currentSchedulerConfig: schedulerConfigSchema.nullable(),
    latestScheduleProposal: scheduleProposalSchema.nullable(),
    activeRun: productionRunSummarySchema.nullable(),
    board: productionBoardSchema.nullable(),
    stations: z.array(productionStationSchema),
    machines: z.array(productionMachineSchema),
    asOf: utcIsoStringSchema,
  })
  .strict();

const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const listProductionLocationsQuerySchema = z
  .object({ includeInactive: queryBooleanSchema.optional().default(false) })
  .strict();

export const listProductionLocationsResultSchema = z
  .object({
    items: z.array(productionLocationSchema),
    asOf: utcIsoStringSchema,
  })
  .strict();

export const listProductionOrdersQuerySchema = z
  .object({
    status: productionOrderStatusSchema.optional(),
    dueAfter: utcIsoStringSchema.optional(),
    dueBefore: utcIsoStringSchema.optional(),
    cursor: z.string().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine(
    (query) =>
      query.dueAfter === undefined ||
      query.dueBefore === undefined ||
      Date.parse(query.dueBefore) > Date.parse(query.dueAfter),
    { path: ['dueBefore'], message: 'dueBefore must be after dueAfter.' },
  );

export const listProductionOrdersResultSchema = z
  .object({
    items: z.array(productionOrderListItemSchema),
    nextCursor: z.string().min(1).nullable(),
    asOf: utcIsoStringSchema,
  })
  .strict();

export const publishSchedulerConfigCommandSchema = z
  .object({
    locationId: z.string().min(1),
    pulseMinutes: z.number().int().positive(),
    foldLbsPerFolderMinute: z.number().positive(),
    stageFitAssertion: z
      .object({
        sortingFits: z.literal(true),
        washingFits: z.literal(true),
        dryingFits: z.literal(true),
      })
      .strict(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const publishSchedulerConfigRequestSchema =
  publishSchedulerConfigCommandSchema.omit({ locationId: true });

export const createProductionShiftCommandSchema = z
  .object({
    locationId: z.string().min(1),
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    effectiveFolderCount: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    'Shift end must be after its start.',
  );

export const createProductionShiftRequestSchema = z
  .object({
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    effectiveFolderCount: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    'Shift end must be after its start.',
  );

export const setProductionOrderPriorityCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionOrderId: productionIdSchema,
    priority: z.boolean(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const setProductionOrderPriorityRequestSchema =
  setProductionOrderPriorityCommandSchema.omit({
    locationId: true,
    productionOrderId: true,
  });

export const createScheduleCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
    schedulerConfigId: productionIdSchema,
    horizonEnd: utcIsoStringSchema,
  })
  .strict();

export const createScheduleRequestSchema = createScheduleCommandSchema.omit({
  locationId: true,
});

export const scheduleRunParamsSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
  })
  .strict();

export const acceptScheduleCommandSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
    expectedOutputPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledgedWarningCodes: z.array(productionWarningCodeSchema),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const acceptScheduleRequestSchema = acceptScheduleCommandSchema.omit({
  locationId: true,
  scheduleRunId: true,
});

export const productionBoardParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
  })
  .strict();

export const productionRunCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionRunId: productionIdSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const productionRunRequestSchema = productionRunCommandSchema.omit({
  locationId: true,
  productionRunId: true,
});

export const stageCommandSchema = z
  .object({
    locationId: z.string().min(1),
    stageRunId: productionIdSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const stageRequestSchema = stageCommandSchema.omit({
  locationId: true,
  stageRunId: true,
});

export const assignStageMachinesCommandSchema = stageCommandSchema
  .extend({ machineIds: z.array(productionIdSchema).min(1) })
  .strict();

export const assignStageMachinesRequestSchema =
  assignStageMachinesCommandSchema.omit({
    locationId: true,
    stageRunId: true,
  });

export const productionLocationParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();

export const productionOrderParamsSchema = productionLocationParamsSchema
  .extend({ productionOrderId: productionIdSchema })
  .strict();

export const productionScheduleParamsSchema = productionLocationParamsSchema
  .extend({ scheduleRunId: productionIdSchema })
  .strict();

export const productionShiftParamsSchema = productionLocationParamsSchema
  .extend({ productionShiftId: productionIdSchema })
  .strict();

export const productionRunParamsSchema = productionLocationParamsSchema
  .extend({ productionRunId: productionIdSchema })
  .strict();

export const productionStageParamsSchema = productionLocationParamsSchema
  .extend({ stageRunId: productionIdSchema })
  .strict();

export const productionWorkspaceParamsSchema = productionLocationParamsSchema;

export const recordOrderIntakeCommandSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    bagCount: z.number().int().nonnegative(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const recordOrderIntakeRequestSchema =
  recordOrderIntakeCommandSchema.omit({
    locationId: true,
    orderId: true,
  });

export const recordOrderIntakeResultSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    bagCount: z.number().int().nonnegative(),
    bagCountProvenance: z.literal('operator_intake'),
    intakeVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const productionLocationResourceInputSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
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
    algorithmVersion: z.literal('fixed-pulse-ffd-v1'),
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

export const productionMutationResultSchema = z
  .object({
    entityId: productionIdSchema,
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const acceptScheduleResultSchema = z
  .object({
    productionRunId: productionIdSchema,
    productionBatchIds: z.array(productionIdSchema).min(1),
    replayed: z.boolean(),
  })
  .strict();
