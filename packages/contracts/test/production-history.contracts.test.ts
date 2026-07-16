import { describe, expect, it } from 'vitest';
import {
  listProductionHistoryActivityQuerySchema,
  listProductionHistoryPlansQuerySchema,
  listProductionHistoryRunsQuerySchema,
  productionHistoryActivityEntrySchema,
  productionHistoryOrderMembershipSchema,
  productionHistoryRunActivitySchema,
  productionHistoryRunSummarySchema,
} from '../src/production/production-history.contracts.ts';

const ids = {
  event: '00000000-0000-4000-8000-000000000001',
  entity: '00000000-0000-4000-8000-000000000002',
  actor: '00000000-0000-4000-8000-000000000003',
  run: '00000000-0000-4000-8000-000000000004',
  shift: '00000000-0000-4000-8000-000000000005',
  schedule: '00000000-0000-4000-8000-000000000006',
} as const;

describe('production history contracts', () => {
  it('defaults and bounds cursor pages', () => {
    expect(listProductionHistoryRunsQuerySchema.parse({})).toEqual({
      limit: 50,
    });
    expect(() =>
      listProductionHistoryRunsQuerySchema.parse({ limit: 101 }),
    ).toThrow();
    expect(() =>
      listProductionHistoryRunsQuerySchema.parse({ limit: 20, offset: 20 }),
    ).toThrow();
  });

  it('accepts only known, location-safe activity filters', () => {
    expect(
      listProductionHistoryActivityQuerySchema.parse({
        runId: ids.run,
        entityType: 'stage_run',
        eventType: 'stage_completed',
      }),
    ).toEqual({
      runId: ids.run,
      entityType: 'stage_run',
      eventType: 'stage_completed',
      limit: 50,
    });
    expect(() =>
      listProductionHistoryActivityQuerySchema.parse({
        eventType: 'private_internal_event',
      }),
    ).toThrow();
  });

  it('models server-side history search, date, and lifecycle filters', () => {
    expect(
      listProductionHistoryRunsQuerySchema.parse({
        search: '10000000',
        status: 'completed',
        createdAfter: '2026-07-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      search: '10000000',
      status: 'completed',
      createdAfter: '2026-07-01T00:00:00.000Z',
    });
    expect(
      listProductionHistoryPlansQuerySchema.parse({
        search: 'fixed-pulse',
        status: 'superseded',
        createdAfter: '2026-07-01T00:00:00.000Z',
      }),
    ).toMatchObject({ search: 'fixed-pulse', status: 'superseded' });
    expect(() =>
      listProductionHistoryRunsQuerySchema.parse({ status: 'draft' }),
    ).toThrow();
  });

  it('rejects raw work-event payloads from the public activity shape', () => {
    const entry = {
      id: ids.event,
      eventType: 'stage_completed',
      entityType: 'stage_run',
      entityId: ids.entity,
      actor: { id: ids.actor, kind: 'user', displayName: 'Alex' },
      expectedVersion: 2,
      productionRunId: ids.run,
      summary: 'Production stage completed',
      details: {
        kind: 'stage',
        action: 'completed',
        version: 3,
        machineIds: [],
        timingConfirmationRecorded: false,
      },
      occurredAt: '2026-07-15T12:00:00.000Z',
    } as const;
    expect(productionHistoryActivityEntrySchema.parse(entry)).toEqual(entry);
    expect(() =>
      productionHistoryActivityEntrySchema.parse({
        ...entry,
        payload: { _idempotency: { command: 'private' } },
      }),
    ).toThrow();
  });

  it('enforces honest aggregate relationships', () => {
    const run = {
      productionRunId: ids.run,
      productionShiftId: ids.shift,
      scheduleRunId: ids.schedule,
      status: 'completed',
      shiftStartsAt: '2026-07-15T12:00:00.000Z',
      shiftEndsAt: '2026-07-15T20:00:00.000Z',
      timezone: 'America/New_York',
      startedAt: '2026-07-15T12:00:00.000Z',
      completedAt: '2026-07-15T19:00:00.000Z',
      plannedCompletionAt: '2026-07-15T18:30:00.000Z',
      batchCount: 4,
      completedBatchCount: 4,
      orderCount: 15,
      priorityOrderCount: 2,
      totalWeightLbs: 800,
      queueVersion: 3,
      overtimeAcknowledged: false,
      createdAt: '2026-07-15T11:50:00.000Z',
    } as const;
    expect(productionHistoryRunSummarySchema.parse(run)).toEqual(run);
    expect(() =>
      productionHistoryRunSummarySchema.parse({
        ...run,
        completedBatchCount: 5,
      }),
    ).toThrow();
  });

  it('models current and released order placements as distinct histories', () => {
    const membership = {
      membershipId: ids.event,
      productionOrderId: ids.entity,
      externalOrderId: 'C-1001',
      orderStatus: 'scheduled',
      derivedWeightLbs: 48,
      bagCount: 2,
      productionBatchId: ids.schedule,
      batchSequence: 3,
      placementProvenance: 'manual_rebatch',
      placement: {
        state: 'current',
        placedAt: '2026-07-15T12:00:00.000Z',
        placedBy: ids.actor,
      },
    } as const;
    expect(productionHistoryOrderMembershipSchema.parse(membership)).toEqual(
      membership,
    );

    const released = {
      ...membership,
      placementProvenance: 'exception_route',
      placement: {
        state: 'released',
        placedAt: '2026-07-15T12:00:00.000Z',
        placedBy: ids.actor,
        releasedAt: '2026-07-15T13:00:00.000Z',
        releasedBy: ids.actor,
        reason: 'needs_more_drying',
      },
    } as const;
    expect(productionHistoryOrderMembershipSchema.parse(released)).toEqual(
      released,
    );
    expect(
      productionHistoryOrderMembershipSchema.parse({
        ...released,
        placement: {
          state: 'released',
          placedAt: '2026-07-15T12:00:00.000Z',
          placedBy: null,
          releasedAt: null,
          releasedBy: null,
          reason: null,
        },
      }).placement,
    ).toMatchObject({ state: 'released', releasedAt: null });
    expect(() =>
      productionHistoryOrderMembershipSchema.parse({
        ...released,
        placement: { ...released.placement, releasedBy: null },
      }),
    ).toThrow();
    expect(() =>
      productionHistoryOrderMembershipSchema.parse({
        ...membership,
        placement: {
          ...membership.placement,
          releasedAt: '2026-07-15T13:00:00.000Z',
        },
      }),
    ).toThrow();
  });

  it('bounds embedded run activity without exposing a silent unbounded read', () => {
    const entry = {
      id: ids.event,
      eventType: 'production_run_started',
      entityType: 'production_run',
      entityId: ids.run,
      actor: { id: ids.actor, kind: 'user', displayName: 'Alex' },
      expectedVersion: null,
      productionRunId: ids.run,
      summary: 'Production run started',
      details: {
        kind: 'run',
        scheduleRunId: ids.schedule,
        batchCount: 1,
        queueVersion: 1,
      },
      occurredAt: '2026-07-15T12:00:00.000Z',
    } as const;
    expect(
      productionHistoryRunActivitySchema.parse({
        items: Array.from({ length: 100 }, () => entry),
        hasMore: true,
      }).items,
    ).toHaveLength(100);
    expect(() =>
      productionHistoryRunActivitySchema.parse({
        items: Array.from({ length: 101 }, () => entry),
        hasMore: false,
      }),
    ).toThrow();
  });
});
