import { describe, expect, it } from 'vitest';
import {
  projectHistoryActivity,
  projectHistoryActivityResult,
} from './project.ts';
import type {
  HistoryActivityEventType,
  HistoryActivityPersistenceRow,
} from './types.ts';

const ids = {
  event: '10000000-0000-4000-8000-000000000001',
  entity: '10000000-0000-4000-8000-000000000002',
  actor: '10000000-0000-4000-8000-000000000003',
  run: '10000000-0000-4000-8000-000000000004',
  shift: '10000000-0000-4000-8000-000000000005',
  sourceBatch: '10000000-0000-4000-8000-000000000006',
  targetBatch: '10000000-0000-4000-8000-000000000007',
  latestRun: '10000000-0000-4000-8000-000000000008',
} as const;

const baseRow = (
  eventType: string,
  overrides: Partial<HistoryActivityPersistenceRow> = {},
): HistoryActivityPersistenceRow => ({
  id: ids.event,
  eventType,
  entityType: 'stage_run',
  entityId: ids.entity,
  actorId: ids.actor,
  actorDisplayName: ' Alex Operator ',
  expectedVersion: 2,
  payload: {},
  currentResolutionState: null,
  currentProductionVersion: null,
  createdAt: new Date('2026-08-21T12:00:00.000Z'),
  cursorCreatedAtKey: '2026-08-21T12:00:00.000000Z',
  resolvedProductionRunId: ids.run,
  ...overrides,
});

const expectedKinds = {
  order_demand_applied: 'demand',
  production_resources_bootstrapped: 'configuration',
  scheduler_config_published: 'configuration',
  production_shift_created: 'shift',
  production_shift_updated: 'shift',
  schedule_computed: 'schedule',
  schedule_accepted: 'schedule',
  production_run_started: 'run',
  production_order_priority_changed: 'order',
  production_order_intake_recorded: 'order',
  production_order_placement_pending: 'order',
  production_order_placement_overtime_required: 'order',
  production_order_placement_resolved: 'order',
  production_order_resolved_without_production: 'order',
  production_order_restored: 'order',
  production_order_bulk_resolved_without_production: 'order',
  production_order_rebatched: 'order',
  production_order_route_exception_recorded: 'order',
  batch_membership_frozen: 'batch',
  batch_membership_unfrozen: 'batch',
  machine_assigned: 'stage',
  stage_started: 'stage',
  stage_completed: 'stage',
  batch_progress_reconciled: 'batch',
} as const satisfies Readonly<
  Record<
    HistoryActivityEventType,
    | 'demand'
    | 'configuration'
    | 'shift'
    | 'schedule'
    | 'run'
    | 'order'
    | 'batch'
    | 'stage'
  >
>;

describe('list-history-activity pure projection', () => {
  it('exhaustively maps the public event allowlist to sanitized detail kinds', () => {
    for (const [eventType, expectedKind] of Object.entries(expectedKinds)) {
      const projected = projectHistoryActivity(baseRow(eventType));

      expect(projected?.eventType).toBe(eventType);
      expect(projected?.summary.length).toBeGreaterThan(0);
      expect(projected?.details.kind).toBe(expectedKind);
    }
  });

  it('selects typed order detail and restore action without leaking payload internals', () => {
    const projected = projectHistoryActivity(
      baseRow('production_order_resolved_without_production', {
        entityType: 'production_order',
        payload: {
          productionRunId: ids.run,
          sourceProductionBatchId: ids.sourceBatch,
          targetProductionBatchId: ids.targetBatch,
          action: 'resolve_without_production',
          bagCount: 2,
          priority: true,
          queueVersion: 3,
          version: 7,
          resolutionState: 'resolved_without_production',
          reason: 'completed_outside_pressly',
          restartStage: 'drying',
          releasedStages: ['washing', 'private_stage'],
          assignedStages: ['drying', 'folding_packaging'],
          note: 'private manager note',
          _idempotency: { command: 'private command' },
        },
        currentResolutionState: 'resolved_without_production',
        currentProductionVersion: 7,
      }),
    );

    expect(projected).toMatchObject({
      actor: { kind: 'user', displayName: 'Alex Operator' },
      productionRunId: ids.run,
      resolutionAction: { action: 'restore', expectedVersion: 7 },
      details: {
        kind: 'order',
        sourceBatchId: ids.sourceBatch,
        targetBatchId: ids.targetBatch,
        outcome: 'resolve_without_production',
        bagCount: 2,
        priority: true,
        queueVersion: 3,
        version: 7,
        resolutionState: 'resolved_without_production',
        resolutionReason: 'completed_outside_pressly',
        routeReason: null,
        restartStage: 'drying',
        releasedStages: ['washing'],
        assignedStages: ['drying', 'folding_packaging'],
      },
    });
    expect(JSON.stringify(projected)).not.toContain('private');
  });

  it('preserves system, unknown, and resolved-run identity fallbacks', () => {
    expect(
      projectHistoryActivity(
        baseRow('production_run_started', {
          entityType: 'production_run',
          entityId: ids.run,
          actorId: '00000000-0000-4000-8000-000000000000',
          actorDisplayName: null,
          resolvedProductionRunId: null,
        }),
      ),
    ).toMatchObject({
      actor: {
        id: '00000000-0000-4000-8000-000000000000',
        kind: 'system',
        displayName: 'System',
      },
      productionRunId: ids.run,
    });

    expect(
      projectHistoryActivity(
        baseRow('stage_started', {
          actorDisplayName: '   ',
          resolvedProductionRunId: null,
          payload: { productionRunId: ids.run },
        }),
      ),
    ).toMatchObject({
      actor: { kind: 'unknown', displayName: null },
      productionRunId: ids.run,
    });
  });

  it('uses an explicit requested run scope over a later resolved membership run', () => {
    expect(
      projectHistoryActivity(
        baseRow('production_order_priority_changed', {
          entityType: 'production_order',
          resolvedProductionRunId: ids.latestRun,
        }),
        ids.run,
      ),
    ).toMatchObject({ productionRunId: ids.run });
    expect(
      projectHistoryActivity(
        baseRow('production_order_priority_changed', {
          entityType: 'production_order',
          resolvedProductionRunId: ids.latestRun,
        }),
      ),
    ).toMatchObject({ productionRunId: ids.latestRun });
  });

  it('drops unknown event/entity rows and serializes dates only at the result edge', () => {
    expect(projectHistoryActivity(baseRow('private_event'))).toBeNull();
    expect(
      projectHistoryActivity(
        baseRow('stage_started', { entityType: 'private_entity' }),
      ),
    ).toBeNull();

    const item = projectHistoryActivity(baseRow('stage_completed'));
    expect(item).not.toBeNull();
    if (item === null) return;

    expect(
      projectHistoryActivityResult({
        items: [item],
        nextCursor: 'next',
        asOf: new Date('2026-08-21T15:00:00.000Z'),
      }),
    ).toMatchObject({
      items: [{ occurredAt: '2026-08-21T12:00:00.000Z' }],
      nextCursor: 'next',
      asOf: '2026-08-21T15:00:00.000Z',
    });
  });
});
