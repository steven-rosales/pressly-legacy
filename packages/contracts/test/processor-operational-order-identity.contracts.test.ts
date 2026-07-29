import {
  processorForecastExpectedLaterItemSchema,
  processorListProductionHistoryActivityResultSchema,
  processorOperationalOrderIdentitySchema,
  processorOrderContextSchema,
  processorProductionBatchOrderSchema,
  processorProductionOrderBacklogPreviewSchema,
} from '../src/index.ts';
import { describe, expect, it } from 'vitest';

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

describe('Processor operational order identity contracts', () => {
  it('keeps the canonical display number and an optional canonical customer name', () => {
    expect(
      processorOperationalOrderIdentitySchema.parse({
        displayNumber: 'ORD-2048',
        customerDisplayName: 'Northwind Hotel',
      }),
    ).toEqual({
      displayNumber: 'ORD-2048',
      customerDisplayName: 'Northwind Hotel',
    });
    expect(
      processorOperationalOrderIdentitySchema.parse({
        displayNumber: 'ORD-2049',
        customerDisplayName: null,
      }),
    ).toEqual({
      displayNumber: 'ORD-2049',
      customerDisplayName: null,
    });
  });

  it('requires identity on forecast rows even before a Production order exists', () => {
    const value = processorForecastExpectedLaterItemSchema.parse({
      orderDemandId: id(1),
      productionOrderId: null,
      externalOrderId: 'legacy-reference',
      identity: {
        displayNumber: 'ORD-2050',
        customerDisplayName: 'Camila Reed',
      },
      dueAt: '2026-07-27T17:00:00.000Z',
      priority: false,
      estimatedWeightLbs: 34,
      bagCount: null,
      readiness: 'awaiting_intake',
      actionability: {
        action: 'record_intake',
        state: 'available',
        reason: 'physical_intake_required',
      },
    });

    expect(value.productionOrderId).toBeNull();
    expect(value.identity).toEqual({
      displayNumber: 'ORD-2050',
      customerDisplayName: 'Camila Reed',
    });
  });

  it('requires canonical identity on every nested production batch order', () => {
    const order = {
      id: id(30),
      externalOrderId: 'legacy-reference',
      dueAt: '2026-07-29T17:00:00.000Z',
      dueBucket: 'today',
      priority: true,
      derivedWeightLbs: 24,
      bagCount: 2,
      version: 1,
      placementProvenance: 'initial_schedule',
      pinnedAt: null,
      pinnedBy: null,
      identity: {
        displayNumber: 'ORD-2055',
        customerDisplayName: 'Santiago Jackson',
      },
    } as const;

    expect(processorProductionBatchOrderSchema.parse(order).identity).toEqual(
      order.identity,
    );
    expect(
      processorProductionBatchOrderSchema.safeParse({
        ...order,
        identity: undefined,
      }).success,
    ).toBe(false);
  });

  it('rejects empty or extra identity fields', () => {
    expect(
      processorOperationalOrderIdentitySchema.safeParse({
        displayNumber: '',
        customerDisplayName: null,
      }).success,
    ).toBe(false);
    expect(
      processorOperationalOrderIdentitySchema.safeParse({
        displayNumber: 'ORD-2051',
        customerDisplayName: 'Customer',
        phone: '+12015550101',
      }).success,
    ).toBe(false);
  });

  it('requires strict canonical versions, bounded source provenance, and generic audit evidence', () => {
    const context = {
      canonicalOrderId: id(20),
      canonicalFulfillmentId: id(21),
      versions: { order: 4, fulfillment: 3 },
      displayNumber: 'ORD-2054',
      customer: {
        resolution: 'resolved',
        userId: id(22),
        firstName: 'Camila',
        lastName: 'Reed',
        businessName: null,
        phone: '+12015550101',
      },
      commercialState: 'open',
      admissionState: 'released',
      source: {
        name: 'cents',
      },
      audit: [
        {
          kind: 'source_observation',
          code: 'source_observation',
          occurredAt: '2026-07-27T12:01:00.000Z',
          actor: 'cents',
          outcome: null,
        },
      ],
    } as const;

    expect(processorOrderContextSchema.parse(context)).toEqual(context);
    expect(
      processorOrderContextSchema.safeParse({
        ...context,
        versions: undefined,
      }).success,
    ).toBe(false);
    expect(
      processorOrderContextSchema.safeParse({
        ...context,
        source: {
          ...context.source,
          status: 'IN_PROGRESS',
        },
      }).success,
    ).toBe(false);
  });

  it('requires canonical identity on every manager backlog preview row', () => {
    const preview = {
      locationId: 'east',
      filter: 'all_due_before_cutoff',
      cutoff: '2026-07-01T03:59:59.999Z',
      reason: 'processor_not_in_use',
      maxOrders: 250,
      candidateCount: 1,
      hasMore: false,
      previewHash: 'a'.repeat(64),
      generatedAt: '2026-07-27T12:00:00.000Z',
      groups: {
        readyToArchive: [
          {
            orderId: id(2),
            displayReference: 'legacy-reference',
            identity: {
              displayNumber: 'ORD-2052',
              customerDisplayName: 'Northwind Hotel',
            },
            dueAt: '2026-06-30T17:00:00.000Z',
            category: 'ready_to_archive',
            reasons: ['no_operator_owned_facts'],
            expectedVersion: 1,
            expectedResolutionState: 'open',
          },
        ],
        reviewIndividually: [],
        keptForSafety: [],
        alreadyHistorical: [],
      },
    } as const;

    expect(
      processorProductionOrderBacklogPreviewSchema.parse(preview).groups
        .readyToArchive[0]?.identity,
    ).toEqual({
      displayNumber: 'ORD-2052',
      customerDisplayName: 'Northwind Hotel',
    });

    const withoutIdentity = structuredClone(preview) as Record<string, unknown>;
    const groups = withoutIdentity['groups'] as {
      readyToArchive: Record<string, unknown>[];
    };
    delete groups.readyToArchive[0]?.['identity'];
    expect(
      processorProductionOrderBacklogPreviewSchema.safeParse(withoutIdentity)
        .success,
    ).toBe(false);
  });

  it('requires identity only for Production order activity entries', () => {
    const orderActivity = {
      id: id(10),
      eventType: 'production_order_resolved_without_production',
      entityType: 'production_order',
      entityId: id(11),
      actor: { id: id(12), kind: 'user', displayName: 'Manager' },
      expectedVersion: 2,
      productionRunId: null,
      resolutionAction: { action: 'restore', expectedVersion: 2 },
      summary: 'Order archived from active work.',
      details: {
        kind: 'order',
        productionRunId: null,
        sourceBatchId: null,
        targetBatchId: null,
        outcome: 'resolved_without_production',
        bagCount: null,
        priority: null,
        queueVersion: null,
        version: 2,
        resolutionState: 'resolved_without_production',
        resolutionReason: 'processor_not_in_use',
        routeReason: null,
        restartStage: null,
        releasedStages: [],
        assignedStages: [],
      },
      occurredAt: '2026-07-27T12:00:00.000Z',
      identity: {
        displayNumber: 'ORD-2053',
        customerDisplayName: 'Camila Reed',
      },
    } as const;
    const configurationActivity = {
      id: id(13),
      eventType: 'scheduler_config_published',
      entityType: 'scheduler_config',
      entityId: id(14),
      actor: { id: id(15), kind: 'user', displayName: 'Manager' },
      expectedVersion: null,
      productionRunId: null,
      resolutionAction: null,
      summary: 'Scheduler configuration published.',
      details: { kind: 'configuration', version: 1 },
      occurredAt: '2026-07-27T12:01:00.000Z',
      identity: null,
    } as const;

    expect(
      processorListProductionHistoryActivityResultSchema.parse({
        items: [orderActivity, configurationActivity],
        nextCursor: null,
        asOf: '2026-07-27T12:02:00.000Z',
      }).items,
    ).toHaveLength(2);
    expect(
      processorListProductionHistoryActivityResultSchema.safeParse({
        items: [{ ...orderActivity, identity: null }],
        nextCursor: null,
        asOf: '2026-07-27T12:02:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      processorListProductionHistoryActivityResultSchema.safeParse({
        items: [
          {
            ...configurationActivity,
            identity: orderActivity.identity,
          },
        ],
        nextCursor: null,
        asOf: '2026-07-27T12:02:00.000Z',
      }).success,
    ).toBe(false);
  });
});
