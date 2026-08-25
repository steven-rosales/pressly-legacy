import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { loadRemainingDayForecastContract } from '@pressly/production-system/operations/queries/load-remaining-day-forecast/contract';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  remainingDayForecastAsOf,
  remainingDayForecastConformanceIds as ids,
  remainingDayForecastConformanceScenarios,
  remainingDayForecastLocationId,
  runRemainingDayForecastConformanceScenario,
  type CanonicalQueryOutcome,
  type RemainingDayForecastConformanceExecutor,
  type RemainingDayForecastConformanceScenario,
  type RemainingDayForecastTraceEvent,
} from '../src/public.ts';
import {
  createRemainingDayForecastConformanceDatabase,
  readRemainingDayForecastState,
  seedRemainingDayForecastConformance,
} from './support/load-remaining-day-forecast-fixture.ts';

const database = createRemainingDayForecastConformanceDatabase();

beforeAll(database.check);
afterAll(database.close);

const idSource = (): IdSource => ({ next: () => ids.actor });

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const withInvalidExecutionState = (value: unknown): unknown => {
  const model = record(value);
  const rows = model?.['demandRows'];
  if (!Array.isArray(rows) || rows.length === 0) return value;
  return {
    ...model,
    demandRows: rows.map((row, index) =>
      index === 0 ? { ...record(row), executionStatus: 'invalid' } : row,
    ),
  };
};

type TransactionOptions = Parameters<PostgresDatabase['transaction']>[1];

const observedDatabase = (
  trace: RemainingDayForecastTraceEvent[],
  corruptExecutionState: boolean,
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
      return corruptExecutionState ? withInvalidExecutionState(value) : value;
    }, options)) as PostgresDatabase['transaction'];

  return new Proxy(database.db, {
    get: (target, property) => {
      if (property === 'transaction') return transaction;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

const clock = (trace: RemainingDayForecastTraceEvent[]) => ({
  now: () => {
    trace.push({ kind: 'clock' });
    return new Date(remainingDayForecastAsOf);
  },
});

const makeExecutor = (
  scenario: RemainingDayForecastConformanceScenario,
): RemainingDayForecastConformanceExecutor => {
  const trace: RemainingDayForecastTraceEvent[] = [];
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
    db: observedDatabase(trace, scenario.fixture === 'lifecycle-conflict'),
    ids: idSource(),
    clock: clock(trace),
  });
  return {
    execute: system.cells.loadRemainingDayForecast.execute,
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

const groups = (
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => record(value['groups']) ?? {};

const groupReferences = (
  value: Readonly<Record<string, unknown>>,
  group: string,
): readonly unknown[] =>
  records(groups(value), group).map((item) => item['externalOrderId']);

const expectReadOnlySnapshot = (
  trace: readonly RemainingDayForecastTraceEvent[],
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

describe('production.load-remaining-day-forecast.v1 permanent PostgreSQL conformance', () => {
  it.each(remainingDayForecastConformanceScenarios)(
    '$name',
    async (scenario) => {
      const observation = await runRemainingDayForecastConformanceScenario({
        scenario,
        reset: database.reset,
        seed: (fixture) =>
          seedRemainingDayForecastConformance(database.db, fixture),
        readState: () => readRemainingDayForecastState(database.db),
        makeExecutor,
      });

      if (observation.outcome.kind === 'success')
        expect(
          loadRemainingDayForecastContract.output.decode(
            observation.outcome.value,
          ),
        ).toEqual({ kind: 'valid', value: observation.outcome.value });
      expect(observation.state.after).toEqual(observation.state.before);
      expectReadOnlySnapshot(observation.trace);

      if (scenario.request.serviceDay === '2026-02-30') {
        expect(observation.outcome).toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'validation',
            classification: 'malformed',
            code: 'production_forecast_service_day_invalid',
          },
        });
        return;
      }
      if (
        scenario.request.locationId === 'missing-forecast-location' ||
        scenario.request.locationId.includes('inactive')
      ) {
        expect(observation.outcome).toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'not_found',
            code: 'production_location_not_found',
          },
        });
        return;
      }
      if (scenario.fixture === 'lifecycle-conflict') {
        expect(observation.outcome).toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'production_order_execution_state_invalid',
            message: 'The production order execution state is invalid.',
          },
        });
        return;
      }
      if (scenario.fixture === 'demand-overflow') {
        expect(observation.outcome).toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'production_forecast_scope_too_large',
          },
        });
        return;
      }

      const forecast = successValue(observation.outcome);
      if (scenario.fixture === 'empty') {
        const expectedWindows: Readonly<
          Record<string, readonly [string, string]>
        > = {
          '2024-02-29': [
            '2024-02-29T05:00:00.000Z',
            '2024-03-01T05:00:00.000Z',
          ],
          '2026-03-08': [
            '2026-03-08T05:00:00.000Z',
            '2026-03-09T04:00:00.000Z',
          ],
          '2026-11-01': [
            '2026-11-01T04:00:00.000Z',
            '2026-11-02T05:00:00.000Z',
          ],
        };
        const expected = expectedWindows[scenario.request.serviceDay];
        expect(record(forecast['window'])).toEqual({
          startsAt: expected?.[0],
          endsAt: expected?.[1],
        });
        expect(groups(forecast)).toEqual({
          expectedLater: [],
          inProduction: [],
          needsShift: [],
          readyToPlace: [],
        });
        return;
      }

      if (scenario.fixture === 'ready-without-run') {
        expect(groupReferences(forecast, 'needsShift')).toEqual([
          'READY-WITHOUT-RUN',
        ]);
        expect(records(groups(forecast), 'needsShift')[0]).toMatchObject({
          activeRunId: null,
          reason: 'no_active_run',
        });
        expect(record(forecast['capacityRisk'])).toMatchObject({
          level: 'unknown',
          reasons: ['needs_shift', 'no_active_run'],
          pulseCapacityLbs: null,
        });
        return;
      }

      if (scenario.fixture === 'ambiguous-runs') {
        expect(groupReferences(forecast, 'needsShift')).toEqual([
          'READY-WITHOUT-RUN',
        ]);
        expect(records(groups(forecast), 'needsShift')[0]).toMatchObject({
          activeRunId: null,
          reason: 'ambiguous_active_run',
        });
        expect(records(forecast, 'shifts')).toEqual([
          expect.objectContaining({
            productionShiftId: ids.shift,
            activeRunId: ids.run,
          }),
          expect.objectContaining({
            productionShiftId: ids.secondShift,
            activeRunId: ids.secondRun,
          }),
        ]);
        expect(record(forecast['capacityRisk'])).toMatchObject({
          level: 'unknown',
          reasons: ['needs_shift', 'ambiguous_active_run'],
          pulseCapacityLbs: null,
        });
        return;
      }

      if (scenario.request.locationId !== remainingDayForecastLocationId) {
        expect(groupReferences(forecast, 'expectedLater')).toEqual([
          'CROSS-LOCATION',
        ]);
        expect(records(forecast, 'shifts')).toEqual([]);
        expect(groupReferences(forecast, 'inProduction')).toEqual([]);
        return;
      }

      expect(forecast).toMatchObject({
        locationId: remainingDayForecastLocationId,
        serviceDay: '2026-03-08',
        timezone: 'America/New_York',
        window: {
          startsAt: '2026-03-08T05:00:00.000Z',
          endsAt: '2026-03-09T04:00:00.000Z',
        },
        asOf: remainingDayForecastAsOf.toISOString(),
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
        capacityRisk: {
          level: 'attention',
          reasons: ['needs_shift', 'expected_later', 'missing_estimates'],
          pulseCapacityLbs: 100,
        },
      });
      expect(records(forecast, 'shifts')).toEqual([
        expect.objectContaining({
          status: 'draft',
          activeRunId: null,
        }),
        expect.objectContaining({
          productionShiftId: ids.shift,
          status: 'open',
          activeRunId: ids.run,
        }),
      ]);
      expect(groupReferences(forecast, 'inProduction')).toEqual([
        'ACTIVE-A-OUTSIDE',
        'ACTIVE-B-OUTSIDE',
      ]);
      expect(groupReferences(forecast, 'readyToPlace')).toEqual([
        'READY-OVERDUE',
      ]);
      expect(groupReferences(forecast, 'expectedLater')).toEqual([
        'EXPECTED-MISSING',
        'EXPECTED-INBOUND',
        'AWAITING-INTAKE',
        'AWAITING-RELEASE',
      ]);
      expect(groupReferences(forecast, 'needsShift')).toEqual([
        'REJECTED-READY',
        'OVERTIME-READY',
      ]);
      expect(
        records(groups(forecast), 'needsShift').map((item) => item['reason']),
      ).toEqual(['placement_rejected', 'current_run_window_exceeded']);
      expect(
        records(groups(forecast), 'needsShift').map(
          (item) => record(item['actionability'])?.['reason'],
        ),
      ).toEqual(['placement_rejected', 'overtime_confirmation_required']);
      expect(observation.state.before.configs).toHaveLength(1);
      expect(observation.state.before.configs[0]).toMatchObject({
        id: ids.config,
        pulseMinutes: 30,
        foldLbsPerFolderMinute: 2,
      });
      expect(observation.state.before.machines.map(({ id }) => id)).toEqual([
        ids.washerA,
        ids.washerB,
        ids.dryer,
      ]);
      expect(observation.state.before.stages).toHaveLength(8);
      expect(
        observation.state.before.assignments.map(({ machineId }) => machineId),
      ).toEqual([ids.washerB, ids.washerA]);
    },
  );
});
