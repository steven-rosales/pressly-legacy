import { describe, expect, it } from 'vitest';
import {
  acceptScheduleCommandSchema,
  acceptScheduleRequestSchema,
  assignStageMachinesCommandSchema,
  assignStageMachinesRequestSchema,
  createProductionShiftCommandSchema,
  createProductionShiftRequestSchema,
  createScheduleCommandSchema,
  createScheduleRequestSchema,
  listProductionLocationsQuerySchema,
  listProductionLocationsResultSchema,
  listProductionOrdersQuerySchema,
  listProductionOrdersResultSchema,
  productionBoardParamsSchema,
  productionBootstrapInputSchema,
  productionBootstrapManifestSchema,
  productionBootstrapResourceChangeSchema,
  productionBootstrapResultSchema,
  productionLocationSchema,
  productionOrderListItemSchema,
  productionOrderSummarySchema,
  productionRunCommandSchema,
  productionRunRequestSchema,
  productionWorkspaceSchema,
  publishSchedulerConfigCommandSchema,
  publishSchedulerConfigRequestSchema,
  recordOrderIntakeCommandSchema,
  recordOrderIntakeRequestSchema,
  recordOrderIntakeResultSchema,
  scheduleRunParamsSchema,
  setProductionOrderPriorityCommandSchema,
  setProductionOrderPriorityRequestSchema,
  stageCommandSchema,
  stageRequestSchema,
} from '../src/production/production.contracts.ts';

const ids = {
  order: '00000000-0000-4000-8000-000000000001',
  shift: '00000000-0000-4000-8000-000000000002',
  config: '00000000-0000-4000-8000-000000000003',
  schedule: '00000000-0000-4000-8000-000000000004',
  run: '00000000-0000-4000-8000-000000000005',
  stage: '00000000-0000-4000-8000-000000000006',
  machine: '00000000-0000-4000-8000-000000000007',
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
          horizonEnd: '2026-07-12T23:59:59.999Z',
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
          horizonEnd: '2026-07-12T23:59:59.999Z',
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
      productionBoardParamsSchema.parse({
        locationId,
        productionShiftId: ids.shift,
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
      currentSchedulerConfig: null,
      latestScheduleProposal: null,
      activeRun: null,
      board: null,
      stations: [],
      machines: [],
      asOf: now,
    };
    expect(productionWorkspaceSchema.parse(workspace)).toEqual(workspace);
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
