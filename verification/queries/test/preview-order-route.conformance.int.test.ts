import { createHash } from 'node:crypto';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';
import {
  makeProductionSystem,
  type ProductionSystemSignals,
} from '@pressly/production-system/testing/assembly';
import type { OrderRouteProposalCommand } from '@pressly/production-system/models/order-route-proposal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  previewOrderRouteConformanceIds as ids,
  previewOrderRouteConformanceScenarios,
  runPreviewOrderRouteConformanceScenario,
  type CanonicalPreviewOrderRouteOutcome,
  type PreviewOrderRouteConformanceVariant,
  type PreviewOrderRouteTraceEvent,
} from '../src/public.ts';
import {
  createPreviewOrderRouteConformanceDatabase,
  readPreviewOrderRouteState,
  seedPreviewOrderRouteConformance,
} from './support/preview-order-route-fixture.ts';
import { productionOnlySystemDependencies } from './support/production-only-system-dependencies.ts';

const database = createPreviewOrderRouteConformanceDatabase();

beforeAll(database.check);
afterAll(database.close);

const makeIds = (): IdSource => ({ next: () => ids.actor });

const observedDatabase = (
  db: PostgresDatabase,
  trace: PreviewOrderRouteTraceEvent[],
): PostgresDatabase =>
  new Proxy(db, {
    get: (target, property) => {
      const value = Reflect.get(target, property, target);
      if (
        (property === 'select' || property === 'transaction') &&
        typeof value === 'function'
      )
        return (...args: unknown[]) => {
          trace.push({ kind: 'read' });
          return Reflect.apply(value, target, args);
        };
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

const clock = (trace: PreviewOrderRouteTraceEvent[]) => ({
  now: () => {
    trace.push({ kind: 'clock' } as const);
    return new Date('2026-08-21T15:00:00.000Z');
  },
});

const targetSignals = (
  trace: PreviewOrderRouteTraceEvent[],
): ProductionSystemSignals => ({
  queueConflict: (input) => {
    trace.push({ kind: 'queue-conflict', operation: input.operation });
  },
  orderRouteOutcome: (input) => {
    trace.push({ kind: 'route-outcome', status: input.status });
  },
});

const settled =
  (
    execute: (input: OrderRouteProposalCommand) => Promise<unknown>,
    trace: PreviewOrderRouteTraceEvent[],
  ) =>
  async (input: OrderRouteProposalCommand): Promise<unknown> => {
    try {
      return await execute(input);
    } finally {
      trace.push({ kind: 'settled' });
    }
  };

const makeTarget = (): PreviewOrderRouteConformanceVariant => {
  const trace: PreviewOrderRouteTraceEvent[] = [];
  const system = makeProductionSystem({
    ...productionOnlySystemDependencies(),
    db: observedDatabase(database.db, trace),
    ids: makeIds(),
    clock: clock(trace),
    signals: targetSignals(trace),
  });
  return {
    execute: settled(system.cells.previewOrderRoute.execute, trace),
    trace: () => trace,
  };
};

const successProposal = (
  outcome: CanonicalPreviewOrderRouteOutcome,
): Readonly<Record<string, unknown>> => {
  expect(outcome.kind).toBe('success');
  if (
    outcome.kind !== 'success' ||
    typeof outcome.value !== 'object' ||
    outcome.value === null ||
    Array.isArray(outcome.value)
  )
    return {};
  return outcome.value as Readonly<Record<string, unknown>>;
};

describe('production.preview-order-route.v1 target conformance', () => {
  it.each(previewOrderRouteConformanceScenarios)('$name', async (scenario) => {
    const observation = await runPreviewOrderRouteConformanceScenario({
      scenario,
      reset: database.reset,
      seed: (fixture) => seedPreviewOrderRouteConformance(database.db, fixture),
      readState: () => readPreviewOrderRouteState(database.db),
      makeTarget,
    });

    expect(observation.state.afterTarget).toEqual(observation.state.before);
    expect(observation.trace[0]).toEqual({ kind: 'read' });
    expect(observation.trace).not.toContainEqual({ kind: 'clock' });
    expect(observation.trace.at(-1)).toEqual({ kind: 'settled' });

    if (scenario.expectedCanonicalBytes !== undefined) {
      const proposal = successProposal(observation.target);
      const { proposalHash, ...unsigned } = proposal;
      expect(JSON.stringify(unsigned)).toBe(scenario.expectedCanonicalBytes);
      expect(proposalHash).toBe(
        createHash('sha256')
          .update(scenario.expectedCanonicalBytes)
          .digest('hex'),
      );
      expect(observation.trace).toEqual([
        { kind: 'read' },
        { kind: 'route-outcome', status: 'proposed' },
        { kind: 'settled' },
      ]);
      return;
    }

    expect(observation.target).toMatchObject({
      kind: 'failure',
      failure: { code: scenario.expectedCode },
    });
    expect(observation.trace).toEqual(
      scenario.expectedCode === 'production_queue_version_conflict'
        ? [
            { kind: 'read' },
            { kind: 'route-outcome', status: 'conflict' },
            {
              kind: 'queue-conflict',
              operation: 'order_route_preview',
            },
            { kind: 'settled' },
          ]
        : [
            { kind: 'read' },
            { kind: 'route-outcome', status: 'rejected' },
            { kind: 'settled' },
          ],
    );
  });
});
