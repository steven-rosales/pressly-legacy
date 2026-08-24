import type { PostgresDatabase } from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import { previewOrderBacklogContract } from '@pressly/production-system/operations/demand/preview-order-backlog/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  previewOrderBacklogConformanceScenarios,
  previewOrderBacklogExpectedCompleteHash,
  previewOrderBacklogExpectedFirstCursor,
  previewOrderBacklogGeneratedAt,
  previewOrderBacklogLocationId,
  previewOrderBacklogMissingLocationId,
  previewOrderBacklogFixtureIds as ids,
  runPreviewOrderBacklogConformanceScenario,
  type CanonicalPreviewOrderBacklogOutcome,
  type PreviewOrderBacklogTarget,
  type PreviewOrderBacklogTraceEvent,
} from '../src/public.ts';
import {
  createPreviewOrderBacklogConformanceDatabase,
  readPreviewOrderBacklogState,
  seedPreviewOrderBacklogConformance,
} from './support/preview-order-backlog-conformance-fixture.ts';
import { productionOnlySystemDependencies } from './support/production-only-system-dependencies.ts';

const database = createPreviewOrderBacklogConformanceDatabase();

beforeAll(database.check);
afterAll(database.close);

const makeIds = (): IdSource => ({ next: () => ids.actor });

const observedDatabase = (
  db: PostgresDatabase,
  trace: PreviewOrderBacklogTraceEvent[],
): PostgresDatabase =>
  new Proxy(db, {
    get: (target, property) => {
      const value = Reflect.get(target, property, target);
      if (property === 'select' && typeof value === 'function')
        return (...args: unknown[]) => {
          trace.push('read');
          return Reflect.apply(value, target, args);
        };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

const clock = (trace: PreviewOrderBacklogTraceEvent[]) => ({
  now: () => {
    trace.push('clock');
    return new Date(previewOrderBacklogGeneratedAt);
  },
});

const makeTarget = (): PreviewOrderBacklogTarget => {
  const trace: PreviewOrderBacklogTraceEvent[] = [];
  const system = makeProductionSystem({
    ...productionOnlySystemDependencies(),
    db: observedDatabase(database.db, trace),
    ids: makeIds(),
    clock: clock(trace),
  });
  return {
    execute: system.cells.previewOrderBacklog.execute,
    trace: () => trace,
  };
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const successValue = (
  outcome: CanonicalPreviewOrderBacklogOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  expect(outcome?.kind).toBe('success');
  const value = outcome?.kind === 'success' ? record(outcome.value) : null;
  expect(value).not.toBeNull();
  return value ?? {};
};

const group = (
  value: Readonly<Record<string, unknown>>,
  name: string,
): readonly Readonly<Record<string, unknown>>[] => {
  const entries = record(value['groups'])?.[name];
  return Array.isArray(entries)
    ? entries.map((entry) => record(entry) ?? {})
    : [];
};

const groupIds = (
  value: Readonly<Record<string, unknown>>,
  name: string,
): readonly unknown[] => group(value, name).map((item) => item['orderId']);

const expectFailureReason = (
  outcome: CanonicalPreviewOrderBacklogOutcome | undefined,
  reason:
    | 'production_order_backlog_cursor_invalid'
    | 'production_order_backlog_cursor_scope_mismatch',
): void => {
  expect(outcome).toMatchObject({
    kind: 'failure',
    failure: {
      tag: 'ProductionFailure',
      kind: 'validation',
      classification: 'malformed',
      code: 'production_order_backlog_cursor_invalid',
    },
  });
  expect(outcome?.kind === 'failure' ? outcome.failure.reason : null).toBe(
    reason,
  );
};

const expectSchemaValid = (
  outcome: CanonicalPreviewOrderBacklogOutcome | undefined,
): void => {
  const value = successValue(outcome);
  expect(previewOrderBacklogContract.output.decode(value)).toMatchObject({
    kind: 'valid',
  });
};

describe('production.preview-order-backlog.v1 target conformance', () => {
  it.each(previewOrderBacklogConformanceScenarios)(
    '$name',
    async (scenario) => {
      const observation = await runPreviewOrderBacklogConformanceScenario({
        scenario,
        reset: database.reset,
        seed: (fixture) =>
          seedPreviewOrderBacklogConformance(database.db, fixture),
        readState: () => readPreviewOrderBacklogState(database.db),
        makeTarget,
      });

      expect(observation.state.after).toEqual(observation.state.before);

      if (scenario.name.startsWith('complete schema-valid')) {
        const preview = successValue(observation.outcome[0]);
        expectSchemaValid(observation.outcome[0]);
        expect(preview).toMatchObject({
          locationId: previewOrderBacklogLocationId,
          candidateCount: 9,
          hasMore: false,
          cursor: null,
          nextCursor: null,
          previewHash: previewOrderBacklogExpectedCompleteHash,
          generatedAt: previewOrderBacklogGeneratedAt.toISOString(),
        });
        expect(groupIds(preview, 'readyToArchive')).toEqual([
          ids.readyA,
          ids.readyB,
          ids.atCutoff,
        ]);
        expect(
          group(preview, 'readyToArchive').map((item) => item['reasons']),
        ).toEqual([
          ['no_operator_owned_facts'],
          ['no_operator_owned_facts'],
          ['no_operator_owned_facts'],
        ]);
        expect(group(preview, 'reviewIndividually')).toEqual([
          expect.objectContaining({
            orderId: ids.review,
            reasons: [
              'intake_recorded',
              'manual_admission',
              'priority',
              'pending_placement',
            ],
          }),
        ]);
        expect(group(preview, 'keptForSafety')).toEqual([
          expect.objectContaining({
            orderId: ids.participant,
            reasons: [
              'execution_committed',
              'selected_for_shift',
              'batch_membership_exists',
              'stage_attempt_exists',
              'route_exists',
            ],
          }),
          expect.objectContaining({
            orderId: ids.selectedSnapshot,
            reasons: ['selected_for_shift'],
          }),
          expect.objectContaining({
            orderId: ids.selectedEvent,
            reasons: ['selected_for_shift'],
          }),
        ]);
        expect(group(preview, 'alreadyHistorical')).toEqual([
          expect.objectContaining({
            orderId: ids.resolved,
            reasons: ['resolved_without_production'],
          }),
          expect.objectContaining({
            orderId: ids.finished,
            reasons: ['execution_finished'],
          }),
        ]);
        expect(observation.timing).toEqual(['read', 'clock']);
        return;
      }

      if (scenario.name.startsWith('inclusive cutoff')) {
        const minimum = successValue(observation.outcome[0]);
        const maximum = successValue(observation.outcome[1]);
        expect(minimum).toMatchObject({
          maxOrders: 1,
          candidateCount: 1,
          hasMore: true,
          nextCursor: expect.any(String),
        });
        expect(maximum).toMatchObject({
          maxOrders: 250,
          candidateCount: 9,
          hasMore: false,
        });
        const allIds = [
          ...groupIds(maximum, 'readyToArchive'),
          ...groupIds(maximum, 'reviewIndividually'),
          ...groupIds(maximum, 'keptForSafety'),
          ...groupIds(maximum, 'alreadyHistorical'),
        ];
        expect(allIds).toContain(ids.atCutoff);
        expect(allIds).not.toContain(ids.afterCutoff);
        expect(observation.timing).toEqual(['read', 'clock', 'read', 'clock']);
        return;
      }

      if (scenario.name.startsWith('missing locations')) {
        const preview = successValue(observation.outcome[0]);
        expect(preview).toMatchObject({
          locationId: previewOrderBacklogMissingLocationId,
          candidateCount: 0,
          hasMore: false,
          nextCursor: null,
          generatedAt: previewOrderBacklogGeneratedAt.toISOString(),
          groups: {
            readyToArchive: [],
            reviewIndividually: [],
            keptForSafety: [],
            alreadyHistorical: [],
          },
        });
        expect(observation.timing).toEqual(['read', 'clock']);
        return;
      }

      if (scenario.name.startsWith('malformed cursor')) {
        expectFailureReason(
          observation.outcome[0],
          'production_order_backlog_cursor_invalid',
        );
        expect(observation.timing).toEqual([]);
        return;
      }

      const first = successValue(observation.outcome[0]);
      const second = successValue(observation.outcome[1]);
      expect(first).toMatchObject({
        maxOrders: 2,
        candidateCount: 2,
        hasMore: true,
        nextCursor: previewOrderBacklogExpectedFirstCursor,
        generatedAt: previewOrderBacklogGeneratedAt.toISOString(),
      });
      expect(groupIds(first, 'readyToArchive')).toEqual([
        ids.readyA,
        ids.readyB,
      ]);
      expect(second).toMatchObject({
        maxOrders: 250,
        candidateCount: 1,
        hasMore: false,
        cursor: previewOrderBacklogExpectedFirstCursor,
        nextCursor: null,
      });
      expect(groupIds(second, 'readyToArchive')).toEqual([ids.review]);
      const encodedPoint = previewOrderBacklogExpectedFirstCursor.split('.')[0];
      expect(
        JSON.parse(
          Buffer.from(encodedPoint ?? '', 'base64url').toString('utf8'),
        ),
      ).toEqual({
        version: 1,
        locationId: previewOrderBacklogLocationId,
        filter: 'all_due_before_cutoff',
        cutoff: '2026-08-01T00:00:00.000Z',
        reason: 'processor_not_in_use',
        dueAt: '2026-07-01T12:00:00.000Z',
        orderId: ids.readyB,
      });
      for (const outcome of observation.outcome.slice(2, 5))
        expectFailureReason(
          outcome,
          'production_order_backlog_cursor_scope_mismatch',
        );
      expectFailureReason(
        observation.outcome[5],
        'production_order_backlog_cursor_invalid',
      );
      expect(observation.timing).toEqual(['read', 'clock', 'read', 'clock']);
    },
  );
});
