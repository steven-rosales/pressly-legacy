import type {
  ProductionHistoryActivityPage,
  ProductionHistoryRunDetail,
  ProductionOrderBacklogPreview,
  ProductionRemainingDayForecast,
  ProductionWorkspaceModel,
} from '@pressly/production';
import {
  canonicalCustomerDisplayName,
  makeOperationalOrderIdentityQueries,
  type OperationalOrderIdentityPort,
} from '@pressly/processor-experience';
import { describe, expect, it, vi } from 'vitest';
import { makeProcessorOperationalOrderIdentityAdapter } from '../../src/http/processor/operational-order-identity/operational-order-identity.adapter.ts';

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

const makeResolver = () => {
  const resolve = vi.fn<OperationalOrderIdentityPort['resolve']>(
    async (references) =>
      new Map(
        references.map((reference) => [
          reference.referenceId,
          {
            identity: {
              displayNumber: `canonical:${reference.fallbackDisplayNumber}`,
              customerDisplayName:
                reference.fallbackDisplayNumber === 'NO-CUSTOMER'
                  ? null
                  : `Customer ${reference.fallbackDisplayNumber}`,
            },
            canonical: null,
          },
        ]),
      ),
  );
  return { resolve };
};

describe('Processor operational order identity composition', () => {
  it('uses business, then personal, then unavailable identity without truncating long names', () => {
    expect(
      canonicalCustomerDisplayName({
        businessName: '  Northwind   Hotel ',
        firstName: 'Ignored',
        lastName: 'Person',
      }),
    ).toBe('Northwind Hotel');
    expect(
      canonicalCustomerDisplayName({
        businessName: ' ',
        firstName: ' Camila ',
        lastName: ' Reed ',
      }),
    ).toBe('Camila Reed');
    expect(
      canonicalCustomerDisplayName({
        businessName: null,
        firstName: null,
        lastName: ' ',
      }),
    ).toBeNull();
    const longName = 'A'.repeat(240);
    expect(
      canonicalCustomerDisplayName({
        businessName: longName,
        firstName: null,
        lastName: null,
      }),
    ).toBe(longName);
  });

  it('resolves one deduplicated workspace batch for selection and live-placement rows', async () => {
    const identities = makeResolver();
    const operationalOrderAdapter =
      makeProcessorOperationalOrderIdentityAdapter(
        makeOperationalOrderIdentityQueries(identities),
      );
    const asOf = new Date('2026-07-15T16:00:00.000Z');
    const pendingOrder = {
      id: id(2),
      externalOrderId: 'ORDER-2',
      dueAt: '2026-07-15T20:00:00.000Z',
      dueBucket: 'today',
      priority: false,
      derivedWeightLbs: 10,
      bagCount: 1,
      version: 1,
      placement: {
        status: 'awaiting_run',
        reason: 'automatic_placement_not_attempted',
        message: 'Placement is pending.',
      },
    } as const;
    const base = {
      location: {
        id: 'east',
        name: 'East',
        timezone: 'America/New_York',
        isActive: true,
      },
      currentShift: null,
      shiftSelection: null,
      candidateShifts: [],
      currentSchedulerConfig: null,
      currentScheduleProposal: null,
      activeRuns: [],
      orders: [
        {
          id: id(1),
          locationId: 'east',
          externalOrderId: 'ORDER-1',
          dueAt: new Date('2026-07-15T20:00:00.000Z'),
          dueBucket: 'today',
          priority: false,
          status: 'eligible',
          derivedWeightLbs: 10,
          bagCount: 1,
          bagCountProvenance: 'operator_intake',
          intakeVersion: 1,
          version: 1,
        },
        {
          id: id(2),
          locationId: 'east',
          externalOrderId: 'ORDER-2',
          dueAt: new Date('2026-07-15T20:00:00.000Z'),
          dueBucket: 'today',
          priority: false,
          status: 'eligible',
          derivedWeightLbs: 10,
          bagCount: 1,
          bagCountProvenance: 'operator_intake',
          intakeVersion: 1,
          version: 1,
        },
      ],
      pendingEligibleOrders: [pendingOrder],
      liveRunChanges: {
        productionRunId: id(10),
        queueVersion: 1,
        pulseCapacityLbs: 50,
        orders: [
          {
            ...pendingOrder,
            recommendedPlacement: {
              status: 'unavailable',
              reason: 'no_mutable_position',
              message: 'No position is available.',
            },
            exactBatchTargets: [],
          },
        ],
      },
      demandOutlook: null,
      board: {
        productionShift: {
          id: id(11),
          locationId: 'east',
          startsAt: new Date('2026-07-15T12:00:00.000Z'),
          endsAt: new Date('2026-07-15T20:00:00.000Z'),
          timezone: 'America/New_York',
          effectiveFolderCount: 2,
          status: 'open',
          version: 1,
        },
        productionRun: {
          id: id(10),
          productionShiftId: id(11),
          status: 'started',
          queueVersion: 1,
          plannedCompletionAt: new Date('2026-07-15T18:00:00.000Z'),
          overtimeAcknowledgement: null,
          version: 1,
        },
        eligibleOrders: [
          {
            id: id(1),
            externalOrderId: 'ORDER-1',
            dueAt: new Date('2026-07-15T20:00:00.000Z'),
            dueBucket: 'today',
            priority: false,
            derivedWeightLbs: 10,
            bagCount: 1,
            version: 1,
            placement: {
              status: 'awaiting_run',
              reason: 'automatic_placement_not_attempted',
              message: 'Placement is pending.',
            },
          },
        ],
        batches: [
          {
            id: id(12),
            sequence: 0,
            status: 'queued',
            derivedWeightLbs: 20,
            pulseCapacityLbs: 50,
            pulseMinutes: 30,
            membership: { state: 'mutable' },
            orders: [
              {
                id: id(1),
                externalOrderId: 'ORDER-1',
                dueAt: new Date('2026-07-15T20:00:00.000Z'),
                dueBucket: 'today',
                priority: false,
                derivedWeightLbs: 10,
                bagCount: 1,
                version: 1,
                placementProvenance: 'initial_schedule',
                pinnedAt: null,
                pinnedBy: null,
              },
              {
                id: id(3),
                externalOrderId: 'NO-CUSTOMER',
                dueAt: new Date('2026-07-15T20:00:00.000Z'),
                dueBucket: 'today',
                priority: false,
                derivedWeightLbs: 10,
                bagCount: 1,
                version: 1,
                placementProvenance: 'initial_schedule',
                pinnedAt: null,
                pinnedBy: null,
              },
            ],
            stages: [],
            version: 1,
          },
        ],
        asOf,
      },
      stations: [],
      machines: [],
      asOf,
    } satisfies ProductionWorkspaceModel;

    const composed = await operationalOrderAdapter.composeWorkspace(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toHaveLength(3);
    expect(composed.orders[0]?.identity).toEqual({
      displayNumber: 'canonical:ORDER-1',
      customerDisplayName: 'Customer ORDER-1',
    });
    expect(composed.liveRunChanges?.orders[0]?.identity.displayNumber).toBe(
      'canonical:ORDER-2',
    );
    expect(composed.board?.batches[0]?.orders[0]?.identity).toEqual({
      displayNumber: 'canonical:ORDER-1',
      customerDisplayName: 'Customer ORDER-1',
    });
    expect(composed.board?.batches[0]?.orders[1]?.identity).toEqual({
      displayNumber: 'canonical:NO-CUSTOMER',
      customerDisplayName: null,
    });
    expect(composed.asOf).toBe(asOf.toISOString());
    expect(composed.orders[0]?.dueAt).toBe('2026-07-15T20:00:00.000Z');
    expect(composed.board?.productionShift.startsAt).toBe(
      '2026-07-15T12:00:00.000Z',
    );
    expect(composed.board?.productionRun.plannedCompletionAt).toBe(
      '2026-07-15T18:00:00.000Z',
    );
    expect(composed.orders).not.toBe(base.orders);
  });

  it('resolves every forecast group in one batch, including demand before Production admission', async () => {
    const identities = makeResolver();
    const operationalOrderAdapter =
      makeProcessorOperationalOrderIdentityAdapter(
        makeOperationalOrderIdentityQueries(identities),
      );
    const asOf = new Date('2026-07-15T16:00:00.000Z');
    const base: ProductionRemainingDayForecast = {
      locationId: 'location-a',
      serviceDay: '2026-07-15',
      timezone: 'America/New_York',
      window: {
        startsAt: new Date('2026-07-15T04:00:00.000Z'),
        endsAt: new Date('2026-07-16T04:00:00.000Z'),
      },
      asOf,
      assumptions: {
        algorithmVersion: 'online-stable-insertion-v1',
        overdueUnfinishedIncluded: true,
        physicalIntakeRequired: true,
        wholeOrderPlacement: true,
        expectedWeightsAdvisory: true,
        missingEstimatesExcludedFromWeightTotals: true,
        placementRevalidatedOnCommit: true,
        preciseFinishForecasted: false,
      },
      shifts: [],
      totals: {
        all: {
          orderCount: 2,
          knownWeightLbs: 10,
          missingEstimateOrderCount: 1,
        },
        inProduction: {
          orderCount: 1,
          knownWeightLbs: 10,
          missingEstimateOrderCount: 0,
        },
        readyToPlace: {
          orderCount: 0,
          knownWeightLbs: 0,
          missingEstimateOrderCount: 0,
        },
        expectedLater: {
          orderCount: 1,
          knownWeightLbs: 0,
          missingEstimateOrderCount: 1,
        },
        needsShift: {
          orderCount: 0,
          knownWeightLbs: 0,
          missingEstimateOrderCount: 0,
        },
      },
      capacityRisk: {
        level: 'unknown',
        reasons: ['missing_estimates'],
        pulseCapacityLbs: null,
      },
      groups: {
        inProduction: [
          {
            productionOrderId: id(10),
            orderDemandId: id(20),
            externalOrderId: 'IN-PRODUCTION',
            dueAt: new Date('2026-07-15T20:00:00.000Z'),
            priority: false,
            estimatedWeightLbs: 10,
            bagCount: 1,
            activeRunId: id(30),
            activeBatchId: id(31),
            actionability: {
              action: 'open_production',
              state: 'available',
              reason: 'already_in_production',
            },
          },
        ],
        readyToPlace: [],
        expectedLater: [
          {
            productionOrderId: null,
            orderDemandId: id(21),
            externalOrderId: 'NO-CUSTOMER',
            dueAt: new Date('2026-07-15T21:00:00.000Z'),
            priority: false,
            estimatedWeightLbs: null,
            bagCount: null,
            readiness: 'not_admitted',
            actionability: {
              action: 'monitor',
              state: 'informational',
              reason: 'missing_estimate',
            },
          },
        ],
        needsShift: [],
      },
    };

    const composed = await operationalOrderAdapter.composeForecast(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productionOrderId: null,
          orderDemandId: id(21),
        }),
      ]),
    );
    expect(
      composed.groups.expectedLater[0]?.identity.customerDisplayName,
    ).toBeNull();
    expect(composed.asOf).toBe(asOf.toISOString());
    expect(composed.groups.inProduction[0]?.dueAt).toBe(
      '2026-07-15T20:00:00.000Z',
    );
  });

  it('resolves all run memberships in one batch and keeps repeated history episodes exact', async () => {
    const identities = makeResolver();
    const operationalOrderAdapter =
      makeProcessorOperationalOrderIdentityAdapter(
        makeOperationalOrderIdentityQueries(identities),
      );
    const base = {
      overview: {
        productionRunId: id(33),
        productionShiftId: id(34),
        scheduleRunId: id(35),
        status: 'completed',
        shiftStartsAt: new Date('2026-07-27T12:00:00.000Z'),
        shiftEndsAt: new Date('2026-07-27T20:00:00.000Z'),
        timezone: 'America/New_York',
        startedAt: new Date('2026-07-27T12:00:00.000Z'),
        completedAt: new Date('2026-07-27T18:00:00.000Z'),
        plannedCompletionAt: new Date('2026-07-27T18:00:00.000Z'),
        batchCount: 0,
        completedBatchCount: 0,
        orderCount: 1,
        priorityOrderCount: 0,
        totalWeightLbs: 10,
        queueVersion: 1,
        overtimeAcknowledged: false,
        createdAt: new Date('2026-07-27T12:00:00.000Z'),
      },
      batches: [],
      orderMemberships: [
        {
          membershipId: id(31),
          productionOrderId: id(30),
          externalOrderId: 'HISTORY-30',
          orderStatus: 'finished',
          derivedWeightLbs: 10,
          bagCount: 1,
          productionBatchId: id(36),
          batchSequence: 0,
          placementProvenance: 'initial_schedule',
          placement: {
            state: 'released',
            placedAt: new Date('2026-07-27T12:00:00.000Z'),
            placedBy: null,
            releasedAt: new Date('2026-07-27T13:00:00.000Z'),
            releasedBy: id(37),
            reason: 'needs_more_drying',
          },
        },
        {
          membershipId: id(32),
          productionOrderId: id(30),
          externalOrderId: 'HISTORY-30',
          orderStatus: 'finished',
          derivedWeightLbs: 10,
          bagCount: 1,
          productionBatchId: id(38),
          batchSequence: 1,
          placementProvenance: 'exception_route',
          placement: {
            state: 'current',
            placedAt: new Date('2026-07-27T13:00:00.000Z'),
            placedBy: id(37),
          },
        },
      ],
      stageProgress: { planned: 0, started: 0, completed: 0, items: [] },
      scheduleLineage: { executionScheduleRunId: id(35), revisions: [] },
      activity: { items: [], hasMore: false },
      asOf: new Date('2026-07-27T18:01:00.000Z'),
    } satisfies ProductionHistoryRunDetail;

    const composed = await operationalOrderAdapter.composeHistoryRun(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toHaveLength(1);
    expect(composed.orderMemberships).toHaveLength(2);
    expect(composed.orderMemberships[1]?.identity.displayNumber).toBe(
      'canonical:HISTORY-30',
    );
    expect(composed.asOf).toBe('2026-07-27T18:01:00.000Z');
  });

  it('resolves all four bounded backlog groups in one batch', async () => {
    const identities = makeResolver();
    const operationalOrderAdapter =
      makeProcessorOperationalOrderIdentityAdapter(
        makeOperationalOrderIdentityQueries(identities),
      );
    const item = (
      value: number,
      category: ProductionOrderBacklogPreview['groups']['readyToArchive'][number]['category'],
    ) => ({
      orderId: id(value),
      displayReference: `BACKLOG-${value}`,
      dueAt: '2026-07-15T20:00:00.000Z',
      category,
      reasons: ['no_operator_owned_facts'] as const,
      expectedVersion: 1,
      expectedResolutionState: 'open' as const,
    });
    const base = {
      locationId: 'east',
      filter: 'all_due_before_cutoff',
      cutoff: '2026-07-15T20:00:00.000Z',
      reason: 'completed_outside_pressly',
      maxOrders: 4,
      candidateCount: 4,
      hasMore: false,
      cursor: null,
      nextCursor: null,
      previewHash: 'a'.repeat(64),
      generatedAt: '2026-07-15T16:00:00.000Z',
      groups: {
        readyToArchive: [item(41, 'ready_to_archive')],
        reviewIndividually: [item(42, 'review_individually')],
        keptForSafety: [item(43, 'kept_for_safety')],
        alreadyHistorical: [item(44, 'already_historical')],
      },
    } satisfies ProductionOrderBacklogPreview;

    const composed = await operationalOrderAdapter.composeBacklogPreview(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toHaveLength(4);
    expect(
      composed.groups.reviewIndividually[0]?.identity.customerDisplayName,
    ).toBe('Customer BACKLOG-42');
    expect(composed.groups.alreadyHistorical[0]?.identity.displayNumber).toBe(
      'canonical:BACKLOG-44',
    );
  });

  it('resolves one activity-page batch for order events and leaves other entities uncomposed', async () => {
    const identities = makeResolver();
    const operationalOrderAdapter =
      makeProcessorOperationalOrderIdentityAdapter(
        makeOperationalOrderIdentityQueries(identities),
      );
    const base = {
      items: [
        {
          id: id(51),
          eventType: 'production_order_intake_recorded',
          entityType: 'production_order',
          entityId: id(52),
          actor: { id: id(56), kind: 'user', displayName: 'Manager' },
          expectedVersion: 1,
          productionRunId: null,
          resolutionAction: null,
          summary: 'Order intake recorded',
          details: {
            kind: 'order',
            productionRunId: null,
            sourceBatchId: null,
            targetBatchId: null,
            outcome: null,
            bagCount: 1,
            priority: null,
            queueVersion: null,
            version: 1,
            resolutionState: null,
            resolutionReason: null,
            routeReason: null,
            restartStage: null,
            releasedStages: [],
            assignedStages: [],
          },
          occurredAt: new Date('2026-07-27T12:00:00.000Z'),
        },
        {
          id: id(53),
          eventType: 'production_order_priority_changed',
          entityType: 'production_order',
          entityId: id(52),
          actor: { id: id(56), kind: 'user', displayName: 'Manager' },
          expectedVersion: 2,
          productionRunId: null,
          resolutionAction: null,
          summary: 'Order priority changed',
          details: {
            kind: 'order',
            productionRunId: null,
            sourceBatchId: null,
            targetBatchId: null,
            outcome: null,
            bagCount: null,
            priority: true,
            queueVersion: null,
            version: 2,
            resolutionState: null,
            resolutionReason: null,
            routeReason: null,
            restartStage: null,
            releasedStages: [],
            assignedStages: [],
          },
          occurredAt: new Date('2026-07-27T12:01:00.000Z'),
        },
        {
          id: id(54),
          eventType: 'schedule_computed',
          entityType: 'schedule_run',
          entityId: id(55),
          actor: { id: id(56), kind: 'user', displayName: 'Manager' },
          expectedVersion: null,
          productionRunId: null,
          resolutionAction: null,
          summary: 'Schedule plan computed',
          details: {
            kind: 'schedule',
            productionShiftId: id(57),
            inputSnapshotHash: 'a'.repeat(64),
            outputPlanHash: 'b'.repeat(64),
            acknowledgedWarningCount: 0,
          },
          occurredAt: new Date('2026-07-27T12:02:00.000Z'),
        },
      ],
      nextCursor: null,
      asOf: new Date('2026-07-27T12:03:00.000Z'),
    } satisfies ProductionHistoryActivityPage;

    const composed = await operationalOrderAdapter.composeHistoryActivity(base);

    expect(identities.resolve).toHaveBeenCalledOnce();
    expect(identities.resolve.mock.calls[0]?.[0]).toHaveLength(1);
    expect(composed.items[0]?.identity?.displayNumber).toBe(
      `canonical:${id(52)}`,
    );
    expect(composed.items[1]?.identity).toEqual(composed.items[0]?.identity);
    expect(composed.items[2]?.identity).toBeNull();
    expect(composed.asOf).toBe('2026-07-27T12:03:00.000Z');
  });
});
