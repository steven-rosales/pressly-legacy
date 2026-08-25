import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import { sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';
import { loadWorkspaceContract } from '@pressly/production-system/operations/queries/load-workspace/contract';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadWorkspaceAsOf,
  loadWorkspaceConformanceIds as ids,
  loadWorkspaceConformanceScenarios,
  loadWorkspaceLocationId,
  runLoadWorkspaceConformanceScenario,
  type CanonicalQueryOutcome,
  type LoadWorkspaceConformanceExecutor,
  type LoadWorkspaceConformanceScenario,
  type LoadWorkspaceTraceEvent,
} from '../src/public.ts';
import {
  createLoadWorkspaceConformanceDatabase,
  readLoadWorkspaceState,
  seedLoadWorkspaceConformance,
} from './support/load-workspace-fixture.ts';

const database = createLoadWorkspaceConformanceDatabase();

beforeAll(database.check);
afterAll(database.close);

const makeIds = (): IdSource => ({ next: () => ids.actor });

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const withLiveIdentityConflict = (value: unknown): unknown => {
  const loaded = record(value);
  const workspace = record(loaded?.['workspace']);
  const runs = workspace?.['activeRuns'];
  if (!Array.isArray(runs)) return value;
  return {
    ...loaded,
    workspace: {
      ...workspace,
      activeRuns: runs.map((run) => {
        const fields = record(run);
        return fields === null
          ? run
          : {
              ...fields,
              queueVersion:
                typeof fields['queueVersion'] === 'number'
                  ? fields['queueVersion'] + 1
                  : fields['queueVersion'],
            };
      }),
    },
  };
};

type TransactionOptions = Parameters<PostgresDatabase['transaction']>[1];

const observedDatabase = (
  trace: LoadWorkspaceTraceEvent[],
  corruptLiveIdentity: boolean,
): PostgresDatabase => {
  const transaction = (async (
    callback: (transaction: PostgresTransaction) => Promise<unknown>,
    options: TransactionOptions,
  ) =>
    database.db.transaction(async (transaction) => {
      const modes = await transaction.execute(sql`show transaction_read_only`);
      const mode = modes[0];
      trace.push({
        kind: 'read',
        isolationLevel: options?.isolationLevel ?? 'missing',
        accessMode: options?.accessMode ?? 'missing',
        transactionReadOnly:
          typeof mode === 'object' &&
          mode !== null &&
          'transaction_read_only' in mode
            ? String(mode['transaction_read_only'])
            : 'missing',
      });
      const value = await callback(transaction);
      return corruptLiveIdentity ? withLiveIdentityConflict(value) : value;
    }, options)) as PostgresDatabase['transaction'];

  return new Proxy(database.db, {
    get: (target, property) => {
      if (property === 'transaction') return transaction;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

const clock = (trace: LoadWorkspaceTraceEvent[]) => ({
  now: () => {
    trace.push({ kind: 'clock' });
    return new Date(loadWorkspaceAsOf);
  },
});

const makeExecutor = (
  scenario: LoadWorkspaceConformanceScenario,
): LoadWorkspaceConformanceExecutor => {
  const trace: LoadWorkspaceTraceEvent[] = [];
  const system = makeProductionSystem({
    schema: presslyPostgresOwnerSchemas.production,
    productionActorReadV1: makeProductionActorReadV1Capability(
      database.db,
      presslyPostgresOwnerSchemas.access,
    ),
    productionScopeReconciliationV1:
      makeProductionScopeReconciliationV1Capability(
        database.db,
        presslyPostgresOwnerSchemas.access,
      ),
    db: observedDatabase(trace, scenario.fixture === 'identity-conflict'),
    ids: makeIds(),
    clock: clock(trace),
  });
  return {
    execute: system.cells.loadWorkspace.execute,
    trace: () => trace,
  };
};

const successValue = (
  outcome: CanonicalQueryOutcome,
): Readonly<Record<string, unknown>> => {
  expect(outcome.kind).toBe('success');
  return outcome.kind === 'success' ? (record(outcome.value) ?? {}) : {};
};

const records = (
  value: Readonly<Record<string, unknown>>,
  field: string,
): readonly Readonly<Record<string, unknown>>[] => {
  const items = value[field];
  return Array.isArray(items) ? items.map((item) => record(item) ?? {}) : [];
};

const idsFor = (
  value: Readonly<Record<string, unknown>>,
  field: string,
  idField = 'id',
): readonly unknown[] => records(value, field).map((item) => item[idField]);

const expectReadOnlySnapshot = (
  trace: readonly LoadWorkspaceTraceEvent[],
): void => {
  expect(trace).toEqual([
    { kind: 'clock' },
    {
      kind: 'read',
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
      transactionReadOnly: 'on',
    },
  ]);
};

describe('production.load-workspace.v1 permanent PostgreSQL conformance', () => {
  it.each(loadWorkspaceConformanceScenarios)('$name', async (scenario) => {
    const observation = await runLoadWorkspaceConformanceScenario({
      scenario,
      reset: database.reset,
      seed: (fixture) => seedLoadWorkspaceConformance(database.db, fixture),
      readState: () => readLoadWorkspaceState(database.db),
      makeExecutor,
    });

    if (observation.outcome.kind === 'success')
      expect(
        loadWorkspaceContract.output.decode(observation.outcome.value),
      ).toEqual({ kind: 'valid', value: observation.outcome.value });
    expect(observation.state.after).toEqual(observation.state.before);
    expectReadOnlySnapshot(observation.trace);

    if (scenario.fixture === 'identity-conflict') {
      expect(observation.outcome).toMatchObject({
        kind: 'failure',
        failure: {
          tag: 'ProductionFailure',
          kind: 'conflict',
          code: 'production_live_placement_run_mismatch',
          message:
            'The live-placement projection does not match the selected started run.',
          safeMessage:
            'The live-placement projection does not match the selected started run.',
        },
      });
      return;
    }

    if (scenario.request.shiftId === ids.unknownShift) {
      expect(observation.outcome).toMatchObject({
        kind: 'failure',
        failure: {
          kind: 'not_found',
          code: 'production_shift_not_found',
        },
      });
      return;
    }

    const workspace = successValue(observation.outcome);
    const currentShift = record(workspace['currentShift']);
    const candidates = records(workspace, 'candidateShifts');

    switch (scenario.fixture) {
      case 'explicit-shift':
        expect(currentShift).toMatchObject({
          id: ids.explicitShift,
          status: 'closed',
        });
        expect(candidates).toEqual([]);
        return;
      case 'precedence-started':
        expect(currentShift?.['id']).toBe(ids.newerShift);
        expect(idsFor(workspace, 'activeRuns')).toEqual([ids.newerRun]);
        expect(candidates).toEqual([]);
        return;
      case 'multiple-started':
        expect(currentShift).toBeNull();
        expect(candidates.map((candidate) => candidate['reason'])).toEqual([
          'started_run',
          'started_run',
        ]);
        expect(
          candidates.map((candidate) => candidate['productionShiftId']),
        ).toEqual([ids.newerShift, ids.olderShift]);
        expect(
          candidates.map((candidate) => candidate['productionRunId']),
        ).toEqual([ids.newerRun, ids.olderRun]);
        return;
      case 'precedence-accepted':
        expect(currentShift?.['id']).toBe(ids.newerShift);
        expect(
          record(workspace['currentScheduleProposal'])?.['scheduleRunId'],
        ).toBe(ids.newerSchedule);
        return;
      case 'multiple-accepted':
        expect(currentShift).toBeNull();
        expect(candidates.map((candidate) => candidate['reason'])).toEqual([
          'accepted_plan',
          'accepted_plan',
        ]);
        expect(
          candidates.map((candidate) => candidate['scheduleRunId']),
        ).toEqual([ids.newerSchedule, ids.olderSchedule]);
        return;
      case 'single-future':
        expect(currentShift?.['id']).toBe(ids.newerShift);
        expect(workspace['currentScheduleProposal']).toBeNull();
        return;
      case 'multiple-future-with-exclusions':
        expect(currentShift).toBeNull();
        expect(
          candidates.map((candidate) => candidate['productionShiftId']),
        ).toEqual([ids.newerShift, ids.olderShift]);
        expect(candidates.map((candidate) => candidate['reason'])).toEqual([
          'open_shift',
          'open_shift',
        ]);
        expect(
          candidates.map((candidate) => candidate['scheduleRunId']),
        ).toEqual([ids.newerSchedule, null]);
        return;
      case 'full-started': {
        expect(workspace).toMatchObject({
          location: { id: loadWorkspaceLocationId, isActive: true },
          currentShift: { id: ids.targetShift },
          shiftSelection: {
            productionShiftId: ids.targetShift,
            version: 2,
            selectedOrderIds: [ids.scheduledOrder],
          },
          currentSchedulerConfig: { id: ids.configV2, version: 2 },
          currentScheduleProposal: null,
          activeRuns: [
            { id: ids.targetRun, status: 'started', queueVersion: 1 },
          ],
          board: { productionRun: { id: ids.targetRun } },
          liveRunChanges: {
            productionRunId: ids.targetRun,
            orders: [{ id: ids.eligibleOrder }],
          },
          demandOutlook: {
            productionShiftId: ids.targetShift,
            readyOrderCount: 1,
            inProductionOrderCount: 1,
            expectedOrderCount: 0,
            forecast: null,
          },
          asOf: loadWorkspaceAsOf.toISOString(),
        });
        expect(new Set(idsFor(workspace, 'orders'))).toEqual(
          new Set([ids.scheduledOrder, ids.eligibleOrder]),
        );
        expect(new Set(idsFor(workspace, 'pendingEligibleOrders'))).toEqual(
          new Set([ids.eligibleOrder]),
        );
        expect(idsFor(workspace, 'stations')).toEqual([
          ids.sortingStation,
          ids.washingStation,
          ids.dryingStation,
          ids.foldingStation,
        ]);
        expect(idsFor(workspace, 'machines')).toEqual([
          ids.washerA,
          ids.washerB,
          ids.dryer,
        ]);
        const demand = record(workspace['demandOutlook']);
        expect(
          records(demand ?? {}, 'items').map((item) => item['externalOrderId']),
        ).toEqual(['READY', 'SCHEDULED']);
        const live = record(workspace['liveRunChanges']);
        expect(idsFor(live ?? {}, 'orders')).toEqual([ids.eligibleOrder]);
        return;
      }
      case 'full-accepted':
        expect(workspace).toMatchObject({
          currentShift: { id: ids.targetShift },
          currentScheduleProposal: {
            scheduleRunId: ids.targetSchedule,
            status: 'accepted',
          },
          activeRuns: [],
          liveRunChanges: null,
          board: null,
          demandOutlook: {
            readyOrderCount: 1,
            expectedOrderCount: 1,
            forecast: {
              algorithmVersion: 'fixed-pulse-demand-outlook-v1',
              batchCount: 1,
            },
          },
        });
        expect(
          records(record(workspace['demandOutlook']) ?? {}, 'items').map(
            (item) => item['externalOrderId'],
          ),
        ).toEqual(['READY', 'EXPECTED']);
        return;
    }
  });
});
