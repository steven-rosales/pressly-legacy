import { describe, expect, it } from 'vitest';
import {
  decodeProductionHistoryCursor,
  encodeProductionHistoryCursor,
  mapProductionHistoryActivity,
  productionHistoryFilterKey,
} from '../../src/list-production-history/list-production-history.mapper.ts';

const ids = {
  event: '00000000-0000-4000-8000-000000000001',
  stage: '00000000-0000-4000-8000-000000000002',
  actor: '00000000-0000-4000-8000-000000000003',
  run: '00000000-0000-4000-8000-000000000004',
} as const;

describe('production history read mapping', () => {
  it('binds descending keyset cursors to their view and filters', () => {
    const filterKey = productionHistoryFilterKey('activity', {
      runId: ids.run,
      eventType: 'stage_completed',
      limit: 25,
    });
    const point = {
      createdAt: new Date('2026-07-15T12:00:00.000Z'),
      id: ids.event,
    };
    const cursor = encodeProductionHistoryCursor('activity', filterKey, point);

    expect(
      decodeProductionHistoryCursor(cursor, 'activity', filterKey),
    ).toEqual(point);
    expect(decodeProductionHistoryCursor(cursor, 'runs', '{}')).toBeNull();
    expect(
      decodeProductionHistoryCursor(
        cursor,
        'activity',
        productionHistoryFilterKey('activity', {
          runId: ids.run,
          eventType: 'stage_started',
          limit: 25,
        }),
      ),
    ).toBeNull();
  });

  it('whitelists a typed activity projection and drops idempotency internals', () => {
    const mapped = mapProductionHistoryActivity(
      {
        id: ids.event,
        eventType: 'stage_completed',
        entityType: 'stage_run',
        entityId: ids.stage,
        actorId: ids.actor,
        actorDisplayName: 'Alex',
        expectedVersion: 2,
        payload: {
          version: 3,
          earlyCompletion: { confirmationHash: 'secret-proof' },
          _idempotency: {
            command: { confirmation: 'private-command' },
            result: { internal: 'private-result' },
          },
        },
        createdAt: new Date('2026-07-15T12:00:00.000Z'),
      },
      ids.run,
    );

    expect(mapped).toMatchObject({
      eventType: 'stage_completed',
      productionRunId: ids.run,
      actor: { kind: 'user', displayName: 'Alex' },
      details: {
        kind: 'stage',
        action: 'completed',
        version: 3,
        timingConfirmationRecorded: true,
      },
    });
    expect(JSON.stringify(mapped)).not.toContain('_idempotency');
    expect(JSON.stringify(mapped)).not.toContain('private-command');
    expect(JSON.stringify(mapped)).not.toContain('secret-proof');
  });

  it('does not project unknown event or entity contracts', () => {
    const base = {
      id: ids.event,
      eventType: 'stage_completed',
      entityType: 'stage_run',
      entityId: ids.stage,
      actorId: ids.actor,
      actorDisplayName: null,
      expectedVersion: null,
      payload: {},
      createdAt: new Date('2026-07-15T12:00:00.000Z'),
    };
    expect(
      mapProductionHistoryActivity({ ...base, eventType: 'future_event' }),
    ).toBeNull();
    expect(
      mapProductionHistoryActivity({ ...base, entityType: 'private_entity' }),
    ).toBeNull();
  });

  it('retains typed route metadata while dropping raw command internals', () => {
    const mapped = mapProductionHistoryActivity(
      {
        id: ids.event,
        eventType: 'production_order_route_exception_recorded',
        entityType: 'production_order',
        entityId: ids.stage,
        actorId: ids.actor,
        actorDisplayName: 'Alex',
        expectedVersion: 2,
        payload: {
          productionRunId: ids.run,
          sourceProductionBatchId: ids.stage,
          targetProductionBatchId: ids.actor,
          reason: 'needs_more_drying',
          restartStage: 'drying',
          releasedStages: ['drying', 'folding_packaging'],
          assignedStages: ['drying', 'folding_packaging'],
          proposalHash: 'not-public',
          note: 'not-public',
        },
        createdAt: new Date('2026-07-15T12:00:00.000Z'),
      },
      ids.run,
    );

    expect(mapped?.details).toEqual({
      kind: 'order',
      productionRunId: ids.run,
      sourceBatchId: ids.stage,
      targetBatchId: ids.actor,
      outcome: null,
      bagCount: null,
      priority: null,
      queueVersion: null,
      version: null,
      resolutionState: null,
      resolutionReason: null,
      routeReason: 'needs_more_drying',
      restartStage: 'drying',
      releasedStages: ['drying', 'folding_packaging'],
      assignedStages: ['drying', 'folding_packaging'],
    });
    expect(JSON.stringify(mapped)).not.toContain('not-public');
  });

  it('projects sanitized resolution activity without private notes', () => {
    const mapped = mapProductionHistoryActivity(
      {
        id: ids.event,
        eventType: 'production_order_resolved_without_production',
        entityType: 'production_order',
        entityId: ids.stage,
        actorId: ids.actor,
        actorDisplayName: 'Alex',
        expectedVersion: 2,
        payload: {
          action: 'resolve_without_production',
          resolutionState: 'resolved_without_production',
          reason: 'completed_outside_pressly',
          note: 'private manager note',
          reviewReasons: ['physical_intake'],
          version: 3,
        },
        currentResolutionState: 'resolved_without_production',
        currentProductionVersion: 3,
        createdAt: new Date('2026-07-15T12:00:00.000Z'),
      },
      null,
    );

    expect(mapped).toMatchObject({
      summary: 'Order archived from active work',
      resolutionAction: { action: 'restore', expectedVersion: 3 },
      details: {
        kind: 'order',
        outcome: 'resolve_without_production',
        resolutionState: 'resolved_without_production',
        resolutionReason: 'completed_outside_pressly',
        version: 3,
      },
    });
    expect(JSON.stringify(mapped)).not.toContain('private manager note');
    expect(JSON.stringify(mapped)).not.toContain('physical_intake');
  });
});
