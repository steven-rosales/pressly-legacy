import { describe, expect, it } from 'vitest';
import {
  acceptScheduleCommandSchema,
  acceptScheduleRequestSchema,
  acceptScheduleResultSchema,
  automaticProductionOrderPlacementResultSchema,
  assignStageMachinesCommandSchema,
  assignStageMachinesRequestSchema,
  advanceProductionStageResultSchema,
  completeStageCommandSchema,
  completeStageRequestSchema,
  confirmProductionOrderOvertimeCommandSchema,
  confirmProductionOrderOvertimeResultSchema,
  createProductionShiftCommandSchema,
  createProductionShiftRequestSchema,
  createScheduleCommandSchema,
  createScheduleRequestSchema,
  exactProductionOrderPlacementResultSchema,
  freezeProductionBatchCommandSchema,
  listProductionLocationsQuerySchema,
  listProductionLocationsResultSchema,
  listProductionOrdersQuerySchema,
  listProductionOrdersResultSchema,
  placeProductionOrderAutomaticallyCommandSchema,
  placeProductionOrderExactlyCommandSchema,
  productionBatchSchema,
  productionRunBoardParamsSchema,
  productionBootstrapInputSchema,
  productionBootstrapManifestSchema,
  productionBootstrapResourceChangeSchema,
  productionBootstrapResultSchema,
  productionDemandOutlookSchema,
  productionLocationSchema,
  productionOrderListItemSchema,
  productionOrderSummarySchema,
  productionRunCommandSchema,
  productionRunRequestSchema,
  productionWorkspaceSchema,
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
  productionStageNextActionSchema,
  productionStageCompletionConfirmationRequiredResultSchema,
  productionStageStartConfirmationRequiredResultSchema,
  reconcileProductionBatchProgressCommandSchema,
  reconcileProductionBatchProgressRequestSchema,
  productionBatchProgressReconciliationResultSchema,
  publishSchedulerConfigCommandSchema,
  publishSchedulerConfigRequestSchema,
  recordOrderIntakeCommandSchema,
  recordOrderIntakeRequestSchema,
  recordOrderIntakeResultSchema,
  replaceProductionShiftSelectionCommandSchema,
  replaceProductionShiftSelectionRequestSchema,
  scheduleRunParamsSchema,
  scheduleProposalSchema,
  schedulerConfigSchema,
  setProductionOrderPriorityCommandSchema,
  setProductionOrderPriorityRequestSchema,
  startScheduleCommandSchema,
  startScheduleRequestSchema,
  startScheduleResultSchema,
  startStageCommandSchema,
  startStageRequestSchema,
  stageCommandSchema,
  stageRequestSchema,
  unfreezeProductionBatchCommandSchema,
} from '../src/production/production.contracts.ts';

const ids = {
  order: '00000000-0000-4000-8000-000000000001',
  shift: '00000000-0000-4000-8000-000000000002',
  config: '00000000-0000-4000-8000-000000000003',
  schedule: '00000000-0000-4000-8000-000000000004',
  run: '00000000-0000-4000-8000-000000000005',
  stage: '00000000-0000-4000-8000-000000000006',
  machine: '00000000-0000-4000-8000-000000000007',
  batch: '00000000-0000-4000-8000-000000000008',
} as const;

const locationId = 'location-main';
const now = '2026-07-12T14:00:00.000Z';

const schedulerCommand = {
  locationId,
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
  },
  idempotencyKey: 'config-command-123',
} as const;

const bootstrapManifest = {
  schemaVersion: 1,
  location: {
    id: locationId,
    name: 'Main Facility',
    timezone: 'America/New_York',
    isActive: true,
  },
  stations: [
    {
      locationId,
      kind: 'sorting',
      label: 'Sorting',
      sortOrder: 1,
      isActive: true,
    },
    {
      locationId,
      kind: 'washing',
      label: 'Washing',
      sortOrder: 2,
      isActive: true,
    },
    {
      locationId,
      kind: 'drying',
      label: 'Drying',
      sortOrder: 3,
      isActive: true,
    },
    {
      locationId,
      kind: 'folding_packaging',
      label: 'Folding and Packaging',
      sortOrder: 4,
      isActive: true,
    },
  ],
  machines: [
    {
      locationId,
      stationKind: 'washing',
      label: 'Washer 01',
      manufacturerCapacityLbs: 60,
      effectiveCapacityLbs: 57,
      capacitySafetyMarginLbs: 3,
      isActive: true,
    },
  ],
  schedulerConfig: {
    locationId,
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v1',
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
  },
} as const;

describe('location-scoped production commands', () => {
  it('accepts a positive location-owned scheduler command', () => {
    expect(publishSchedulerConfigCommandSchema.parse(schedulerCommand)).toEqual(
      schedulerCommand,
    );
  });

  it.each([
    { pulseMinutes: 0, foldLbsPerFolderMinute: 2 },
    { pulseMinutes: 56, foldLbsPerFolderMinute: 0 },
  ])('rejects non-positive scheduler values', (values) => {
    expect(() =>
      publishSchedulerConfigCommandSchema.parse({
        ...schedulerCommand,
        ...values,
      }),
    ).toThrow();
  });

  it('keeps location in backend commands and out of request bodies', () => {
    const requestCases = [
      [
        publishSchedulerConfigRequestSchema,
        {
          pulseMinutes: 56,
          foldLbsPerFolderMinute: 2,
          stageFitAssertion: schedulerCommand.stageFitAssertion,
          idempotencyKey: 'config-command-123',
        },
      ],
      [
        createProductionShiftRequestSchema,
        {
          startsAt: '2026-07-12T14:00:00.000Z',
          endsAt: '2026-07-12T20:00:00.000Z',
          timezone: 'America/New_York',
          effectiveFolderCount: 2,
          idempotencyKey: 'shift-command-123',
        },
      ],
      [
        setProductionOrderPriorityRequestSchema,
        {
          priority: true,
          expectedVersion: 1,
          idempotencyKey: 'priority-command-123',
        },
      ],
      [
        createScheduleRequestSchema,
        {
          productionShiftId: ids.shift,
          schedulerConfigId: ids.config,
          idempotencyKey: 'schedule-command-123',
        },
      ],
      [
        acceptScheduleRequestSchema,
        {
          expectedOutputPlanHash: 'a'.repeat(64),
          acknowledgedWarningCodes: [],
          idempotencyKey: 'accept-command-123',
        },
      ],
      [
        startScheduleRequestSchema,
        {
          expectedOutputPlanHash: 'a'.repeat(64),
          idempotencyKey: 'start-command-123',
        },
      ],
      [
        productionRunRequestSchema,
        { expectedVersion: 1, idempotencyKey: 'run-command-123' },
      ],
      [
        stageRequestSchema,
        { expectedVersion: 1, idempotencyKey: 'stage-command-123' },
      ],
      [
        assignStageMachinesRequestSchema,
        {
          expectedVersion: 1,
          idempotencyKey: 'machine-command-123',
          machineIds: [ids.machine],
        },
      ],
      [
        recordOrderIntakeRequestSchema,
        {
          bagCount: 2,
          expectedVersion: 1,
          idempotencyKey: 'intake-command-123',
        },
      ],
    ] as const;

    for (const [schema, body] of requestCases) {
      expect(schema.safeParse(body).success).toBe(true);
      expect(
        schema.safeParse({ ...body, locationId }).success,
        `${String(schema)} must reject path-owned locationId`,
      ).toBe(false);
    }
  });

  it('requires locationId on every entity-scoped backend command', () => {
    const commands = [
      [
        setProductionOrderPriorityCommandSchema,
        {
          locationId,
          productionOrderId: ids.order,
          priority: true,
          expectedVersion: 1,
          idempotencyKey: 'priority-command-123',
        },
      ],
      [
        createScheduleCommandSchema,
        {
          locationId,
          productionShiftId: ids.shift,
          schedulerConfigId: ids.config,
          idempotencyKey: 'schedule-command-123',
        },
      ],
      [
        acceptScheduleCommandSchema,
        {
          locationId,
          scheduleRunId: ids.schedule,
          expectedOutputPlanHash: 'a'.repeat(64),
          acknowledgedWarningCodes: [],
          idempotencyKey: 'accept-command-123',
        },
      ],
      [
        startScheduleCommandSchema,
        {
          locationId,
          scheduleRunId: ids.schedule,
          expectedOutputPlanHash: 'a'.repeat(64),
          idempotencyKey: 'start-command-123',
        },
      ],
      [
        productionRunCommandSchema,
        {
          locationId,
          productionRunId: ids.run,
          expectedVersion: 1,
          idempotencyKey: 'run-command-123',
        },
      ],
      [
        stageCommandSchema,
        {
          locationId,
          stageRunId: ids.stage,
          expectedVersion: 1,
          idempotencyKey: 'stage-command-123',
        },
      ],
      [
        assignStageMachinesCommandSchema,
        {
          locationId,
          stageRunId: ids.stage,
          machineIds: [ids.machine],
          expectedVersion: 1,
          idempotencyKey: 'machine-command-123',
        },
      ],
      [
        recordOrderIntakeCommandSchema,
        {
          locationId,
          orderId: ids.order,
          bagCount: 0,
          expectedVersion: 1,
          idempotencyKey: 'intake-command-123',
        },
      ],
    ] as const;

    for (const [schema, command] of commands) {
      expect(schema.safeParse(command).success).toBe(true);
      const { locationId: _locationId, ...unscoped } = command;
      expect(schema.safeParse(unscoped).success).toBe(false);
    }
  });

  it('requires location ownership on path-scoped reads', () => {
    expect(
      scheduleRunParamsSchema.parse({
        locationId,
        scheduleRunId: ids.schedule,
      }),
    ).toBeDefined();
    expect(
      productionRunBoardParamsSchema.parse({
        locationId,
        productionRunId: ids.run,
      }),
    ).toBeDefined();
    expect(
      scheduleRunParamsSchema.safeParse({ scheduleRunId: ids.schedule })
        .success,
    ).toBe(false);
  });

  it('rejects inverted shifts and unknown command fields', () => {
    expect(() =>
      createProductionShiftCommandSchema.parse({
        locationId,
        startsAt: '2026-07-12T16:00:00.000Z',
        endsAt: '2026-07-12T15:00:00.000Z',
        timezone: 'America/New_York',
        effectiveFolderCount: 2,
        idempotencyKey: 'shift-command-123',
      }),
    ).toThrow();
    expect(() =>
      stageCommandSchema.parse({
        locationId,
        stageRunId: ids.stage,
        expectedVersion: 1,
        idempotencyKey: 'stage-command-123',
        bypassPulseBoundary: true,
      }),
    ).toThrow();
  });
});

describe('run-centered scheduling contracts', () => {
  it('reads historical v1 and current v2 scheduling facts', () => {
    const config = {
      id: ids.config,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v1',
      version: 1,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
        assertedBy: ids.order,
        assertedAt: now,
      },
      publishedAt: now,
    } as const;

    expect(schedulerConfigSchema.safeParse(config).success).toBe(true);
    expect(
      schedulerConfigSchema.safeParse({
        ...config,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 2,
      }).success,
    ).toBe(true);

    const proposal = {
      scheduleRunId: ids.schedule,
      productionShiftId: ids.shift,
      schedulerConfigId: ids.config,
      status: 'draft',
      inputSnapshotHash: 'a'.repeat(64),
      outputPlanHash: 'b'.repeat(64),
      algorithmVersion: 'fixed-pulse-ffd-v1',
      pulseMinutes: 56,
      pulseCapacityLbs: 224,
      batchCount: 0,
      makespanMinutes: 0,
      plannedCompletionAt: now,
      batches: [],
      unplacedOrderIds: [],
      warnings: [],
      createdAt: now,
      acceptedAt: null,
      acceptedBy: null,
      acknowledgedWarningCodes: [],
      supersededAt: null,
    } as const;

    expect(scheduleProposalSchema.safeParse(proposal).success).toBe(true);
    expect(
      scheduleProposalSchema.safeParse({
        ...proposal,
        algorithmVersion: 'fixed-pulse-ffd-v2',
      }).success,
    ).toBe(true);
  });

  it('separates acceptance identity from execution created at Start', () => {
    expect(
      acceptScheduleResultSchema.parse({
        scheduleRunId: ids.schedule,
        productionShiftId: ids.shift,
        acceptedAt: now,
        replayed: false,
      }),
    ).not.toHaveProperty('productionRunId');

    expect(
      startScheduleResultSchema.parse({
        scheduleRunId: ids.schedule,
        productionRunId: ids.run,
        productionBatchIds: [ids.batch],
        queueVersion: 1,
        startedAt: now,
        replayed: false,
      }),
    ).toMatchObject({ productionRunId: ids.run, queueVersion: 1 });
  });

  it('uses explicit run and optional shift selection on reads', () => {
    expect(
      productionRunBoardParamsSchema.parse({
        locationId,
        productionRunId: ids.run,
      }),
    ).toBeDefined();
    expect(
      productionWorkspaceQuerySchema.parse({ shiftId: ids.shift }),
    ).toEqual({ shiftId: ids.shift });
    expect(
      productionWorkspaceParamsSchema.parse({ locationId, shiftId: ids.shift }),
    ).toBeDefined();
  });

  it('requires optimistic versions on placement and membership commands', () => {
    const queueFields = {
      locationId,
      productionRunId: ids.run,
      expectedQueueVersion: 3,
      idempotencyKey: 'placement-command-123',
    } as const;
    const membershipFields = {
      ...queueFields,
      productionBatchId: ids.batch,
      expectedBatchVersion: 2,
    } as const;

    expect(freezeProductionBatchCommandSchema.parse(membershipFields)).toEqual(
      membershipFields,
    );
    expect(
      unfreezeProductionBatchCommandSchema.parse(membershipFields),
    ).toEqual(membershipFields);
    expect(
      placeProductionOrderAutomaticallyCommandSchema.parse({
        ...queueFields,
        productionOrderId: ids.order,
      }),
    ).toBeDefined();
    expect(
      placeProductionOrderExactlyCommandSchema.parse({
        ...membershipFields,
        productionOrderId: ids.order,
      }),
    ).toBeDefined();
    expect(
      confirmProductionOrderOvertimeCommandSchema.parse({
        ...queueFields,
        productionOrderId: ids.order,
        proposalHash: 'c'.repeat(64),
      }),
    ).toBeDefined();
    expect(
      freezeProductionBatchCommandSchema.safeParse({
        ...membershipFields,
        expectedQueueVersion: 0,
      }).success,
    ).toBe(false);
  });

  it('models automatic, exact, and overtime outcomes as discriminated results', () => {
    const placed = {
      status: 'placed',
      mode: 'automatic',
      productionRunId: ids.run,
      productionOrderId: ids.order,
      productionBatchId: ids.batch,
      createdBatch: false,
      affectedBatchIds: [ids.batch],
      queueVersion: 4,
      proposalHash: 'd'.repeat(64),
      plannedCompletionAt: now,
      overtimeMinutes: 0,
      replayed: false,
    } as const;
    expect(automaticProductionOrderPlacementResultSchema.parse(placed)).toEqual(
      placed,
    );

    const confirmation = {
      status: 'confirmation_required',
      mode: 'manager_exact',
      productionRunId: ids.run,
      productionOrderId: ids.order,
      target: {
        kind: 'existing_batch',
        productionBatchId: ids.batch,
        sequence: 2,
      },
      affectedBatchIds: [ids.batch],
      queueVersion: 4,
      proposalHash: 'd'.repeat(64),
      projectedCompletionAt: now,
      overtimeMinutes: 56,
      replayed: false,
    } as const;
    expect(
      exactProductionOrderPlacementResultSchema.parse(confirmation),
    ).toEqual(confirmation);
    expect(
      confirmProductionOrderOvertimeResultSchema.safeParse(confirmation)
        .success,
    ).toBe(false);
  });

  it('requires non-queued membership to be frozen and exact placement to be pinned', () => {
    const order = {
      id: ids.order,
      externalOrderId: 'C-1001',
      dueAt: now,
      dueBucket: 'today',
      priority: false,
      derivedWeightLbs: 74,
      bagCount: 2,
      version: 1,
      placementProvenance: 'initial_schedule',
      pinnedAt: null,
      pinnedBy: null,
    } as const;
    const stages = ['sorting', 'washing', 'drying', 'folding_packaging'].map(
      (stage, index) => ({
        id: `00000000-0000-4000-8000-0000000000${20 + index}`,
        productionBatchId: ids.batch,
        stage,
        status: 'planned',
        plannedStartAt: now,
        plannedEndAt: '2026-07-12T15:00:00.000Z',
        actualStartAt: null,
        actualEndAt: null,
        actualStartProvenance: 'not_recorded',
        actualEndProvenance: 'not_recorded',
        machineIds: [],
        nextAction: {
          state: 'blocked',
          action: 'start',
          code: 'PRODUCTION_RUN_NOT_STARTED',
          message: 'The production run has not started.',
          availableAt: null,
        },
        allowedActions: [],
        version: 1,
      }),
    );
    const batch = {
      id: ids.batch,
      sequence: 0,
      status: 'sorting',
      derivedWeightLbs: 74,
      pulseCapacityLbs: 224,
      pulseMinutes: 56,
      membership: { state: 'mutable' },
      orders: [order],
      stages,
      version: 1,
    };

    expect(productionBatchSchema.safeParse(batch).success).toBe(false);
    expect(
      productionBatchSchema.safeParse({
        ...batch,
        membership: {
          state: 'frozen',
          frozenAt: now,
          frozenBy: ids.order,
        },
      }).success,
    ).toBe(true);
    expect(
      productionBatchSchema.safeParse({
        ...batch,
        status: 'queued',
        orders: [
          {
            ...order,
            placementProvenance: 'manager_exact',
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('production discovery and intake contracts', () => {
  const summary = {
    id: ids.order,
    externalOrderId: 'C-1001',
    dueAt: '2026-07-12T20:00:00.000Z',
    dueBucket: 'today',
    priority: false,
    derivedWeightLbs: 74,
    bagCount: 2,
    version: 1,
  } as const;

  const intakePending = {
    ...summary,
    locationId,
    status: 'intake_pending',
    bagCount: null,
    bagCountProvenance: null,
    intakeVersion: null,
  } as const;

  it('keeps schedulable summaries distinct from nullable intake list items', () => {
    expect(productionOrderSummarySchema.parse(summary).bagCount).toBe(2);
    expect(
      productionOrderSummarySchema.parse({
        ...summary,
        dueBucket: 'overdue',
      }).dueBucket,
    ).toBe('overdue');
    expect(
      productionOrderSummarySchema.safeParse({ ...summary, bagCount: null })
        .success,
    ).toBe(false);
    expect(productionOrderListItemSchema.parse(intakePending)).toEqual(
      intakePending,
    );
    expect(
      productionOrderListItemSchema.safeParse({
        ...intakePending,
        status: 'eligible',
      }).success,
    ).toBe(false);
  });

  it('requires bag-count provenance whenever intake exists', () => {
    const eligible = {
      ...intakePending,
      status: 'eligible',
      bagCount: 2,
      bagCountProvenance: 'operator_intake',
      intakeVersion: 1,
    };
    expect(productionOrderListItemSchema.safeParse(eligible).success).toBe(
      true,
    );
    expect(
      productionOrderListItemSchema.safeParse({
        ...eligible,
        bagCountProvenance: null,
      }).success,
    ).toBe(false);
  });

  it('accepts zero as an observed intake count and returns provenance/version', () => {
    expect(
      recordOrderIntakeResultSchema.parse({
        locationId,
        orderId: ids.order,
        bagCount: 0,
        bagCountProvenance: 'operator_intake',
        intakeVersion: 1,
        version: 2,
        replayed: false,
      }),
    ).toMatchObject({ bagCount: 0, intakeVersion: 1 });
    expect(
      recordOrderIntakeCommandSchema.safeParse({
        locationId,
        orderId: ids.order,
        bagCount: -1,
        expectedVersion: 1,
        idempotencyKey: 'intake-command-123',
      }).success,
    ).toBe(false);
  });

  it('parses bounded order filters and rejects inverted due windows', () => {
    expect(listProductionOrdersQuerySchema.parse({ limit: '25' })).toEqual({
      limit: 25,
    });
    expect(listProductionOrdersQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      listProductionOrdersQuerySchema.safeParse({
        dueAfter: '2026-07-13T00:00:00.000Z',
        dueBefore: '2026-07-12T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      listProductionOrdersQuerySchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
  });

  it('parses location discovery query strings without truthy-string coercion', () => {
    expect(listProductionLocationsQuerySchema.parse({})).toEqual({
      includeInactive: false,
    });
    expect(
      listProductionLocationsQuerySchema.parse({ includeInactive: 'false' }),
    ).toEqual({ includeInactive: false });
    expect(
      listProductionLocationsQuerySchema.parse({ includeInactive: 'true' }),
    ).toEqual({ includeInactive: true });
  });

  it('keeps discovery results strict and cursor-based', () => {
    const location = {
      id: locationId,
      name: 'Main Facility',
      timezone: 'America/New_York',
      isActive: true,
    };
    expect(productionLocationSchema.parse(location)).toEqual(location);
    expect(
      listProductionLocationsResultSchema.parse({
        items: [location],
        asOf: now,
      }),
    ).toBeDefined();
    expect(
      listProductionOrdersResultSchema.parse({
        items: [intakePending],
        nextCursor: null,
        asOf: now,
      }),
    ).toBeDefined();
    expect(
      listProductionOrdersResultSchema.safeParse({
        items: [intakePending],
        nextCursor: null,
        asOf: now,
        total: 1,
      }).success,
    ).toBe(false);
  });

  it('represents a resumable workspace with all current state absent', () => {
    const workspace = {
      location: {
        id: locationId,
        name: 'Main Facility',
        timezone: 'America/New_York',
        isActive: true,
      },
      currentShift: null,
      shiftSelection: null,
      candidateShifts: [],
      currentSchedulerConfig: null,
      currentScheduleProposal: null,
      activeRuns: [],
      orders: [],
      pendingEligibleOrders: [],
      demandOutlook: null,
      board: null,
      stations: [],
      machines: [],
      asOf: now,
    };
    expect(productionWorkspaceSchema.parse(workspace)).toEqual(workspace);
  });

  it('requires a unique, versioned order selection for a production shift', () => {
    const command = {
      locationId,
      productionShiftId: ids.shift,
      selectedOrderIds: [ids.order],
      expectedVersion: 0,
      idempotencyKey: 'replace-shift-selection',
    };
    expect(replaceProductionShiftSelectionCommandSchema.parse(command)).toEqual(
      command,
    );
    expect(
      replaceProductionShiftSelectionRequestSchema.parse({
        selectedOrderIds: command.selectedOrderIds,
        expectedVersion: command.expectedVersion,
        idempotencyKey: command.idempotencyKey,
      }),
    ).toBeDefined();
    expect(
      replaceProductionShiftSelectionCommandSchema.safeParse({
        ...command,
        selectedOrderIds: [ids.order, ids.order],
      }).success,
    ).toBe(false);
  });

  it('keeps demand forecasts explicitly advisory and separate from floor readiness', () => {
    const outlook = {
      productionShiftId: ids.shift,
      horizonCutoffAt: '2026-07-13T04:00:00.000Z',
      totalOrderCount: 1,
      totalEstimatedWeightLbs: 42,
      estimateMissingOrderCount: 0,
      expectedOrderCount: 1,
      expectedEstimatedWeightLbs: 42,
      readyOrderCount: 0,
      readyEstimatedWeightLbs: 0,
      inProductionOrderCount: 0,
      inProductionEstimatedWeightLbs: 0,
      reconciliationCount: 0,
      items: [
        {
          orderDemandId: ids.order,
          productionOrderId: null,
          externalOrderId: 'CENTS-1001',
          phase: 'expected',
          sourceStatusCode: 'SUBMITTED',
          dueAt: '2026-07-12T20:00:00.000Z',
          estimatedWeightLbs: 42,
          readiness: 'not_admitted',
          productionStatus: null,
          bagCount: null,
          reconciliation: 'none',
        },
      ],
      forecast: {
        algorithmVersion: 'fixed-pulse-demand-outlook-v1',
        startsAt: now,
        completesAt: '2026-07-12T17:44:00.000Z',
        pulseMinutes: 56,
        pulseCapacityLbs: 224,
        batchCount: 1,
        makespanMinutes: 224,
        batches: [
          {
            sequence: 0,
            demandIds: [ids.order],
            estimatedWeightLbs: 42,
            expectedOrderCount: 1,
            readyOrderCount: 0,
          },
        ],
        unplacedDemandIds: [],
      },
    };

    expect(productionDemandOutlookSchema.parse(outlook)).toEqual(outlook);
  });
});

describe('production stage availability contracts', () => {
  it('separates timing confirmations from hard blocks', () => {
    expect(
      productionStageNextActionSchema.safeParse({
        state: 'available',
        action: 'start',
      }).success,
    ).toBe(true);
    expect(
      productionStageNextActionSchema.safeParse({
        state: 'confirmation_required',
        action: 'start',
        code: 'PLANNED_START_NOT_REACHED',
        message: 'This stage is scheduled to start later.',
        availableAt: '2026-07-12T15:00:00.000Z',
        timing: {
          plannedStartAt: '2026-07-12T15:00:00.000Z',
          plannedEndAt: '2026-07-12T15:56:00.000Z',
          observedAt: '2026-07-12T14:30:00.000Z',
          remainingMilliseconds: 30 * 60_000,
        },
      }).success,
    ).toBe(true);
    expect(
      productionStageNextActionSchema.safeParse({
        state: 'confirmation_required',
        action: 'complete',
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        message: 'This stage has not yet occupied its planned pulse.',
        availableAt: '2026-07-12T15:00:00.000Z',
        timing: {
          actualStartAt: '2026-07-12T14:18:00.000Z',
          plannedEndAt: '2026-07-12T15:00:00.000Z',
          completionBoundaryAt: '2026-07-12T15:14:00.000Z',
          observedAt: '2026-07-12T14:30:00.000Z',
          plannedDurationMilliseconds: 56 * 60_000,
          elapsedMilliseconds: 12 * 60_000,
          remainingMilliseconds: 44 * 60_000,
        },
      }).success,
    ).toBe(true);
    expect(
      productionStageNextActionSchema.safeParse({
        state: 'blocked',
        action: 'complete',
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        message: 'The pulse is still active.',
        availableAt: '2026-07-12T15:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      productionStageNextActionSchema.safeParse({
        state: 'terminal',
        reason: 'stage_completed',
      }).success,
    ).toBe(true);
    expect(
      productionStageNextActionSchema.safeParse({
        state: 'blocked',
        action: 'start',
        code: 'PLEASE_WAIT',
        message: 'Unknown policy result.',
        availableAt: null,
      }).success,
    ).toBe(false);
  });

  it('validates start and completion confirmations independently', () => {
    const base = {
      locationId,
      stageRunId: ids.stage,
      expectedVersion: 3,
      idempotencyKey: 'stage-completion-command',
    };
    const confirmation = {
      observedAt: '2026-07-12T14:30:00.000Z',
      confirmationHash: 'c'.repeat(64),
    };

    expect(startStageCommandSchema.safeParse(base).success).toBe(true);
    expect(startStageCommandSchema.parse({ ...base, confirmation })).toEqual({
      ...base,
      confirmation,
    });
    expect(completeStageCommandSchema.parse({ ...base, confirmation })).toEqual(
      { ...base, confirmation },
    );
    expect(
      completeStageRequestSchema.parse({
        expectedVersion: 3,
        idempotencyKey: 'stage-completion-command',
        confirmation,
      }),
    ).toEqual({
      expectedVersion: 3,
      idempotencyKey: 'stage-completion-command',
      confirmation,
    });
    expect(
      startStageRequestSchema.parse({
        expectedVersion: 3,
        idempotencyKey: 'stage-completion-command',
        confirmation,
      }),
    ).toEqual({
      expectedVersion: 3,
      idempotencyKey: 'stage-completion-command',
      confirmation,
    });
  });

  it('validates the server-derived confirmation response and mutation union', () => {
    const confirmationRequired = {
      status: 'confirmation_required',
      stageRunId: ids.stage,
      stageVersion: 3,
      code: 'PULSE_BOUNDARY_NOT_REACHED',
      message: 'This stage has not yet occupied its planned pulse.',
      confirmation: {
        observedAt: '2026-07-12T14:30:00.000Z',
        confirmationHash: 'd'.repeat(64),
      },
      timing: {
        actualStartAt: '2026-07-12T14:18:00.000Z',
        plannedEndAt: '2026-07-12T15:00:00.000Z',
        completionBoundaryAt: '2026-07-12T15:14:00.000Z',
        observedAt: '2026-07-12T14:30:00.000Z',
        plannedDurationMilliseconds: 56 * 60_000,
        elapsedMilliseconds: 12 * 60_000,
        remainingMilliseconds: 44 * 60_000,
      },
      replayed: false,
    } as const;

    expect(
      productionStageCompletionConfirmationRequiredResultSchema.parse(
        confirmationRequired,
      ),
    ).toEqual(confirmationRequired);
    expect(
      advanceProductionStageResultSchema.parse(confirmationRequired),
    ).toEqual(confirmationRequired);
    const earlyStartRequired = {
      status: 'confirmation_required',
      stageRunId: ids.stage,
      stageVersion: 3,
      code: 'PLANNED_START_NOT_REACHED',
      message: 'This stage is scheduled to start later.',
      confirmation: {
        observedAt: '2026-07-12T14:30:00.000Z',
        confirmationHash: 'e'.repeat(64),
      },
      timing: {
        plannedStartAt: '2026-07-12T15:00:00.000Z',
        plannedEndAt: '2026-07-12T15:56:00.000Z',
        observedAt: '2026-07-12T14:30:00.000Z',
        remainingMilliseconds: 30 * 60_000,
      },
      replayed: false,
    } as const;
    expect(
      productionStageStartConfirmationRequiredResultSchema.parse(
        earlyStartRequired,
      ),
    ).toEqual(earlyStartRequired);
    expect(
      advanceProductionStageResultSchema.parse(earlyStartRequired),
    ).toEqual(earlyStartRequired);
    expect(
      advanceProductionStageResultSchema.parse({
        entityId: ids.stage,
        version: 4,
        replayed: false,
      }),
    ).toEqual({ entityId: ids.stage, version: 4, replayed: false });
  });
});

describe('production floor progress reconciliation contracts', () => {
  const command = {
    locationId,
    productionRunId: ids.run,
    productionBatchId: ids.batch,
    expectedQueueVersion: 2,
    expectedBatchVersion: 3,
    expectedStageVersions: [
      { stageRunId: ids.stage, version: 1 },
      { stageRunId: '00000000-0000-4000-8000-000000000010', version: 1 },
      { stageRunId: '00000000-0000-4000-8000-000000000011', version: 1 },
      { stageRunId: '00000000-0000-4000-8000-000000000012', version: 1 },
    ],
    target: 'drying_started',
    reason: 'lpms_unavailable',
    machineIds: ['00000000-0000-4000-8000-000000000013'],
    idempotencyKey: 'reconcile-floor-progress',
  } as const;

  it('requires exact versions, target-compatible machines, and meaningful other reasons', () => {
    expect(
      reconcileProductionBatchProgressCommandSchema.parse(command),
    ).toEqual(command);
    const {
      locationId: _,
      productionRunId: __,
      productionBatchId: ___,
      ...body
    } = command;
    expect(reconcileProductionBatchProgressRequestSchema.parse(body)).toEqual(
      body,
    );
    expect(
      reconcileProductionBatchProgressCommandSchema.safeParse({
        ...command,
        target: 'sorting_completed',
      }).success,
    ).toBe(false);
    expect(
      reconcileProductionBatchProgressCommandSchema.safeParse({
        ...command,
        reason: 'other',
      }).success,
    ).toBe(false);
  });

  it('validates the preview and committed result union', () => {
    expect(
      productionBatchProgressReconciliationResultSchema.safeParse({
        status: 'confirmation_required',
        productionRunId: ids.run,
        productionBatchId: ids.batch,
        currentMilestone: 'waiting_to_sort',
        targetMilestone: 'drying_started',
        queueVersion: 2,
        batchVersion: 3,
        stageVersions: command.expectedStageVersions,
        confirmation: { proposalHash: 'f'.repeat(64) },
        effects: {
          completedStages: ['sorting', 'washing'],
          activeStage: 'drying',
          finishesBatch: false,
          finishesRun: false,
          closesShift: false,
        },
        replayed: false,
      }).success,
    ).toBe(true);
    expect(
      productionBatchProgressReconciliationResultSchema.safeParse({
        status: 'reconciled',
        productionRunId: ids.run,
        productionBatchId: ids.batch,
        milestone: 'drying_started',
        queueVersion: 3,
        batchVersion: 4,
        stageVersions: command.expectedStageVersions,
        finishedOrderCount: 0,
        finishedBagCount: 0,
        runCompleted: false,
        shiftClosed: false,
        replayed: false,
      }).success,
    ).toBe(true);
  });
});

describe('production bootstrap contracts', () => {
  it('accepts one strict, internally location-consistent manifest', () => {
    expect(productionBootstrapManifestSchema.parse(bootstrapManifest)).toEqual(
      bootstrapManifest,
    );
    expect(
      productionBootstrapInputSchema.parse({
        manifest: bootstrapManifest,
        dryRun: true,
        idempotencyKey: 'bootstrap-command-123',
      }),
    ).toBeDefined();
  });

  it('rejects cross-location resources and duplicate natural keys', () => {
    expect(
      productionBootstrapManifestSchema.safeParse({
        ...bootstrapManifest,
        stations: [
          {
            ...bootstrapManifest.stations[0],
            locationId: 'another-location',
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      productionBootstrapManifestSchema.safeParse({
        ...bootstrapManifest,
        machines: [
          bootstrapManifest.machines[0],
          bootstrapManifest.machines[0],
        ],
      }).success,
    ).toBe(false);
  });

  it('requires capacity for active machines and rejects undeclared input', () => {
    expect(
      productionBootstrapManifestSchema.safeParse({
        ...bootstrapManifest,
        machines: [
          {
            ...bootstrapManifest.machines[0],
            effectiveCapacityLbs: null,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      productionBootstrapManifestSchema.safeParse({
        ...bootstrapManifest,
        deleteMissingMachines: true,
      }).success,
    ).toBe(false);
  });

  it('models dry-run changes without claiming they were applied', () => {
    const result = {
      status: 'converged',
      mode: 'dry_run',
      configurationHash: 'a'.repeat(64),
      operations: [
        {
          resourceType: 'location',
          naturalKey: locationId,
          outcome: 'noop',
          changedFields: [],
        },
        {
          resourceType: 'station',
          naturalKey: 'washing',
          outcome: 'created',
          changedFields: ['locationId', 'isActive'],
        },
      ],
      rejections: [],
      summary: { created: 1, updated: 0, noop: 1, rejected: 0 },
      applied: false,
      replayed: false,
    };
    expect(productionBootstrapResultSchema.parse(result)).toEqual(result);
    expect(
      productionBootstrapResultSchema.safeParse({ ...result, applied: true })
        .success,
    ).toBe(false);
  });

  it('models repeated apply convergence as all no-ops', () => {
    const result = {
      status: 'converged',
      mode: 'apply',
      configurationHash: 'b'.repeat(64),
      operations: [
        {
          resourceType: 'location',
          naturalKey: locationId,
          outcome: 'noop',
          changedFields: [],
        },
      ],
      rejections: [],
      summary: { created: 0, updated: 0, noop: 1, rejected: 0 },
      applied: true,
      replayed: true,
    };
    expect(productionBootstrapResultSchema.parse(result)).toEqual(result);
  });

  it('rejects dishonest change details and summary counts', () => {
    expect(
      productionBootstrapResourceChangeSchema.safeParse({
        resourceType: 'machine',
        naturalKey: 'washing/Washer 01',
        outcome: 'noop',
        changedFields: ['effectiveCapacityLbs'],
      }).success,
    ).toBe(false);

    expect(
      productionBootstrapResultSchema.safeParse({
        status: 'converged',
        mode: 'apply',
        configurationHash: 'c'.repeat(64),
        operations: [],
        rejections: [],
        summary: { created: 1, updated: 0, noop: 0, rejected: 0 },
        applied: true,
        replayed: false,
      }).success,
    ).toBe(false);
  });

  it('returns a non-applied destructive rejection instead of deleting inventory', () => {
    const result = {
      status: 'rejected',
      mode: 'apply',
      configurationHash: 'd'.repeat(64),
      operations: [],
      rejections: [
        {
          resourceType: 'machine',
          naturalKey: 'washing/Washer 01',
          outcome: 'rejected',
          code: 'destructive_resource_removal',
          message: 'Existing inventory cannot be removed by bootstrap.',
        },
      ],
      summary: { created: 0, updated: 0, noop: 0, rejected: 1 },
      applied: false,
      replayed: false,
    };
    expect(productionBootstrapResultSchema.parse(result)).toEqual(result);
    expect(
      productionBootstrapResultSchema.safeParse({
        ...result,
        rejections: [],
        summary: { ...result.summary, rejected: 0 },
      }).success,
    ).toBe(false);
  });
});
