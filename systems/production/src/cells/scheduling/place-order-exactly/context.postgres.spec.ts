import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { describe, expect, it } from 'vitest';
import { loadPlaceOrderExactlyContext } from './context.postgres.ts';

type QueryLabel =
  | 'run'
  | 'order'
  | 'schedule'
  | 'batches'
  | 'memberships'
  | 'stages'
  | 'assignments'
  | 'existing-membership';

const makeDatabaseTrace = () => {
  const trace: string[] = [];
  let membershipReads = 0;
  const rows: Readonly<Record<QueryLabel, readonly unknown[]>> = {
    run: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        scheduleRunId: '10000000-0000-4000-8000-000000000002',
        status: 'started',
        queueVersion: 4,
      },
    ],
    order: [
      {
        id: '10000000-0000-4000-8000-000000000003',
        priority: false,
        derivedWeightLbs: 20,
        bagCount: 1,
        operationalStatus: 'eligible',
        executionStatus: 'unassigned',
        version: 2,
      },
    ],
    schedule: [
      {
        inputSnapshot: {
          orders: [],
          machines: [],
          shift: {
            id: '10000000-0000-4000-8000-000000000004',
            startsAt: '2026-08-22T12:00:00.000Z',
            endsAt: '2026-08-22T22:00:00.000Z',
            timezone: 'America/New_York',
            effectiveFolderCount: 2,
            version: 1,
          },
          config: {
            id: '10000000-0000-4000-8000-000000000005',
            pulseMinutes: 60,
            foldLbsPerFolderMinute: 2,
            algorithmVersion: 'fixed-pulse-ffd-v2',
            version: 1,
          },
        },
        outputPlan: {
          algorithmVersion: 'fixed-pulse-ffd-v2',
          inputSnapshotHash: 'a'.repeat(64),
          outputPlanHash: 'b'.repeat(64),
          canonicalOutput: '{}',
          pulseMinutes: 60,
          pulseCapacityLbs: 100,
          batchCount: 1,
          makespanMinutes: 240,
          plannedCompletionAt: '2026-08-22T16:00:00.000Z',
          batches: [],
          unplacedOrderIds: [],
          warnings: [],
        },
      },
    ],
    batches: [
      {
        id: '10000000-0000-4000-8000-000000000006',
        locationId: 'location-1',
        productionRunId: '10000000-0000-4000-8000-000000000001',
        sequenceIndex: 0,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 40,
        pulseMinutes: 60,
        plannedDoneAt: new Date('2026-08-22T16:00:00.000Z'),
        membershipFrozenAt: null,
        version: 3,
      },
    ],
    memberships: [],
    stages: [
      {
        id: '10000000-0000-4000-8000-000000000007',
        locationId: 'location-1',
        productionBatchId: '10000000-0000-4000-8000-000000000006',
        stageKind: 'sorting',
        plannedStartAt: new Date('2026-08-22T12:00:00.000Z'),
        plannedEndAt: new Date('2026-08-22T13:00:00.000Z'),
      },
    ],
    assignments: [],
    'existing-membership': [],
  };

  const database = {
    select: () => {
      let label: QueryLabel = 'run';
      const query = {
        from: (table: unknown) => {
          if (table === productionTestSchema.productionRuns) label = 'run';
          else if (table === productionTestSchema.productionOrders)
            label = 'order';
          else if (table === productionTestSchema.scheduleRuns)
            label = 'schedule';
          else if (table === productionTestSchema.productionBatches)
            label = 'batches';
          else if (table === productionTestSchema.stageRuns) label = 'stages';
          else if (table === productionTestSchema.stageMachineAssignments)
            label = 'assignments';
          else if (table === productionTestSchema.productionBatchOrders)
            label =
              membershipReads++ === 0 ? 'memberships' : 'existing-membership';
          return query;
        },
        innerJoin: () => query,
        where: () => query,
        limit: () => query,
        orderBy: (...order: unknown[]) => {
          trace.push(`order:${label}:${order.length}`);
          return query;
        },
        for: (lock: string) => {
          trace.push(`lock:${label}:${lock}`);
          return Promise.resolve(rows[label]);
        },
        then: <Result>(
          resolve: (value: readonly unknown[]) => Result | PromiseLike<Result>,
        ) => {
          trace.push(`read:${label}`);
          return Promise.resolve(rows[label]).then(resolve);
        },
      };
      return query;
    },
  } as unknown as PostgresExecutor;

  return { database, trace };
};

describe('place order exactly context SQL order', () => {
  it('locks only run, order, and sequence-ordered batches before read-only graph facts', async () => {
    const harness = makeDatabaseTrace();
    await expect(
      loadPlaceOrderExactlyContext(
        harness.database,
        {
          locationId: 'location-1',
          productionRunId: '10000000-0000-4000-8000-000000000001',
          productionOrderId: '10000000-0000-4000-8000-000000000003',
        },
        productionTestSchema,
      ),
    ).resolves.not.toBeNull();

    expect(harness.trace).toEqual([
      'lock:run:update',
      'lock:order:update',
      'read:schedule',
      'order:batches:1',
      'lock:batches:update',
      'order:stages:1',
      'read:memberships',
      'read:stages',
      'read:assignments',
      'read:existing-membership',
    ]);
    expect(harness.trace.filter((step) => step.startsWith('lock:'))).toEqual([
      'lock:run:update',
      'lock:order:update',
      'lock:batches:update',
    ]);
  });
});
