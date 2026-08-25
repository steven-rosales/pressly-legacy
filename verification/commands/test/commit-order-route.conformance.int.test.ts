import type { PostgresDatabase } from '@pressly/postgres/client';
import {
  makeProductionSystem,
  type ProductionSystemSignals,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import type { CommitOrderRouteCommand } from '@pressly/production-system/operations/orders/commit-order-route/types';
import type { OrderRouteProposalCommand } from '@pressly/production-system/models/order-route-proposal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitOrderRouteConformanceIds as ids,
  commitOrderRouteConformanceLocationId as locationId,
  commitOrderRouteConformanceNow as now,
  commitOrderRouteConformanceScenarios,
  type CommitOrderRouteConformanceExpectedOutcome,
  type CommitOrderRouteConformanceFixture,
  type CommitOrderRouteConformanceScenario,
} from '../src/public.ts';
import {
  applyCommitOrderRouteConformanceMutation,
  createCommitOrderRouteConformanceDatabase,
  makeCommitOrderRouteConformanceIds,
  readCommitOrderRouteConformanceState,
  seedCommitOrderRouteConformance,
} from './support/commit-order-route-fixture.ts';
import { productionCommandSystemDependencies } from '../src/production-command-system-dependencies.ts';

const database = createCommitOrderRouteConformanceDatabase();

beforeAll(database.check);
afterAll(database.close);

type CanonicalFailure = Readonly<{
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

type CanonicalOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'failure'; failure: CanonicalFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalFailure }>;

type TransactionTrace = Readonly<{
  operation: string;
  outcome: 'committed' | 'expected_rollback' | 'failed';
}>;

type SignalTrace =
  | Readonly<{
      kind: 'route-outcome';
      operation: string;
      status: string;
      routeKind: string;
      reason: string;
    }>
  | Readonly<{ kind: 'queue-conflict'; operation: string }>;

type VariantObservation = Readonly<{
  outcomes: readonly CanonicalOutcome[];
  before: unknown;
  after: unknown;
  signals: readonly SignalTrace[];
  transactions: readonly TransactionTrace[];
  clockReads: number;
  trace: readonly ('signal' | 'transaction')[];
}>;

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const stringField = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
  fallback: string,
): string => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : fallback;
};

const canonicalFailure = (value: unknown): CanonicalFailure => {
  const fields = record(value);
  return Object.freeze({
    kind: stringField(fields, 'kind', 'unknown'),
    classification:
      typeof fields?.['classification'] === 'string'
        ? fields['classification']
        : null,
    code: stringField(fields, 'code', 'unknown_error'),
    message:
      value instanceof Error
        ? value.message
        : stringField(fields, 'message', 'Unknown error.'),
    safeMessage:
      typeof fields?.['safeMessage'] === 'string'
        ? fields['safeMessage']
        : null,
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  });
};

const captureOutcome = async (
  execute: (command: CommitOrderRouteCommand) => Promise<unknown>,
  command: CommitOrderRouteCommand,
): Promise<CanonicalOutcome> => {
  try {
    const raw = await execute(command);
    const carrier = record(raw);
    if (carrier?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['error']),
      });
    if (carrier?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['failure']),
      });
    return Object.freeze({
      kind: 'success',
      value:
        carrier?.['tag'] === 'ok' || carrier?.['kind'] === 'success'
          ? carrier['value']
          : raw,
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

const replaceStrings = (
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown => {
  if (typeof value === 'string') return replacements.get(value) ?? value;
  if (Array.isArray(value))
    return value.map((entry) => replaceStrings(entry, replacements));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      replaceStrings(entry, replacements),
    ]),
  );
};

const normalizeState = (
  state: unknown,
  scenario: CommitOrderRouteConformanceScenario,
): unknown => {
  const fields = record(canonicalize(state));
  const events = Array.isArray(fields?.['events'])
    ? fields['events'].map((event) => {
        const eventFields = record(event);
        return eventFields === null
          ? event
          : { ...eventFields, createdAt: '<database-created-at>' };
      })
    : fields?.['events'];
  let normalized: unknown = fields === null ? state : { ...fields, events };

  const replacements = new Map<string, string>();
  if (scenario.normalizeWinningActor === true) {
    replacements.set(ids.actor, '<winning-actor>');
    replacements.set(ids.alternateActor, '<winning-actor>');
  }
  if (scenario.normalizeWinningIdempotencyKey === true) {
    replacements.set('commit-route-conformance-race-a', '<winning-key>');
    replacements.set('commit-route-conformance-race-b', '<winning-key>');
  }
  if (replacements.size > 0)
    normalized = replaceStrings(normalized, replacements);
  return canonicalize(normalized);
};

const sorted = <Value>(values: readonly Value[]): readonly Value[] =>
  values
    .slice()
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );

const routeSignals = (
  target: SignalTrace[],
  trace: ('signal' | 'transaction')[],
) => ({
  orderRouteOutcome: (input: {
    operation: string;
    status: string;
    kind: string;
    reason: string;
  }) => {
    trace.push('signal');
    target.push({
      kind: 'route-outcome',
      operation: input.operation,
      status: input.status,
      routeKind: input.kind,
      reason: input.reason,
    });
  },
  queueConflict: (input: { operation: string }) => {
    trace.push('signal');
    target.push({ kind: 'queue-conflict', operation: input.operation });
  },
});

const targetSignals = (
  target: SignalTrace[],
  trace: ('signal' | 'transaction')[],
): ProductionSystemSignals => routeSignals(target, trace);

const targetTransactionObserver =
  (
    target: TransactionTrace[],
    trace: ('signal' | 'transaction')[],
  ): ProductionSystemUnitOfWorkObserver =>
  (operation, unitOfWork) => ({
    transaction: async (work) => {
      let outcome: TransactionTrace['outcome'] = 'failed';
      try {
        const value = await unitOfWork.transaction(work);
        outcome = value.tag === 'err' ? 'expected_rollback' : 'committed';
        return value;
      } finally {
        if (operation === 'production.route_order') {
          trace.push('transaction');
          target.push({ operation, outcome });
        }
      }
    },
  });

const proposalCommand = (
  fixture: CommitOrderRouteConformanceFixture,
): OrderRouteProposalCommand => {
  const identity = {
    locationId,
    productionRunId: ids.productionRun,
    productionOrderId: ids.sourceOrder,
    actorId: ids.actor,
    authorizedAction: 'production:stage' as const,
    expectedQueueVersion: 4,
    expectedOrderVersion: 3,
    expectedSourceBatchVersion: 2,
  };
  return fixture === 'in_flight'
    ? {
        ...identity,
        kind: 'exception',
        reason: 'rewash_required',
        restartStage: 'washing',
        note: 'Rewash verified.',
      }
    : {
        ...identity,
        kind: 'queued_move',
        reason: 'manual_rebatch',
        targetProductionBatchId: ids.lateTargetBatch,
        restartStage: 'sorting',
      };
};

const proposalHashFor = async (
  database: PostgresDatabase,
  fixture: CommitOrderRouteConformanceFixture,
): Promise<string> => {
  const system = makeProductionSystem({
    ...productionCommandSystemDependencies(),
    db: database,
    ids: makeCommitOrderRouteConformanceIds(),
    clock: { now: () => now },
  });
  const outcome = await system.cells.previewOrderRoute.execute(
    proposalCommand(fixture),
  );
  return outcome.kind === 'success'
    ? outcome.value.proposalHash
    : 'a'.repeat(64);
};

const observeTarget = async (
  scenario: CommitOrderRouteConformanceScenario,
): Promise<VariantObservation> => {
  await database.reset();
  await seedCommitOrderRouteConformance(database.db, scenario.fixture);
  const proposalHash = await proposalHashFor(database.db, scenario.fixture);
  await applyCommitOrderRouteConformanceMutation(
    database.db,
    scenario.mutation,
  );
  const before = await readCommitOrderRouteConformanceState(database.db);
  const signals: SignalTrace[] = [];
  const transactions: TransactionTrace[] = [];
  const trace: ('signal' | 'transaction')[] = [];
  let clockReads = 0;
  const clock = {
    now: () => {
      clockReads += 1;
      return now;
    },
  };
  const idsSource = makeCommitOrderRouteConformanceIds();

  const execute = makeProductionSystem({
    ...productionCommandSystemDependencies(),
    db: database.db,
    ids: idsSource,
    clock,
    signals: targetSignals(signals, trace),
    observeCellUnitOfWork: targetTransactionObserver(transactions, trace),
  }).cells.commitOrderRoute.execute;
  const commands = scenario.commands(proposalHash);
  const outcomes =
    scenario.execution === 'concurrent'
      ? await Promise.all(
          commands.map((command) => captureOutcome(execute, command)),
        )
      : await commands.reduce<Promise<CanonicalOutcome[]>>(
          async (pending, command) => [
            ...(await pending),
            await captureOutcome(execute, command),
          ],
          Promise.resolve([]),
        );
  const after = await readCommitOrderRouteConformanceState(database.db);
  return Object.freeze({
    outcomes,
    before,
    after,
    signals,
    transactions,
    clockReads,
    trace,
  });
};

const outcomeSummary = (
  outcome: CanonicalOutcome,
): CommitOrderRouteConformanceExpectedOutcome =>
  outcome.kind === 'success'
    ? {
        kind: 'success',
        replayed: record(outcome.value)?.['replayed'] === true,
      }
    : outcome.kind === 'failure'
      ? { kind: 'failure', code: outcome.failure.code }
      : { kind: 'unexpected', code: outcome.error.code };

const expectedTransactions = (
  outcomes: readonly CanonicalOutcome[],
): readonly TransactionTrace[] =>
  outcomes.map((outcome) => ({
    operation: 'production.route_order',
    outcome:
      outcome.kind === 'unexpected'
        ? 'failed'
        : outcome.kind === 'failure'
          ? 'expected_rollback'
          : 'committed',
  }));

describe('production.commit-order-route.v1 target PostgreSQL conformance', () => {
  it.each(commitOrderRouteConformanceScenarios)('$name', async (scenario) => {
    const target = await observeTarget(scenario);

    const expected =
      scenario.normalizeOutcomeOrder === true
        ? sorted(scenario.expectedOutcomes)
        : scenario.expectedOutcomes;
    expect(
      scenario.normalizeOutcomeOrder === true
        ? sorted(target.outcomes.map(outcomeSummary))
        : target.outcomes.map(outcomeSummary),
    ).toEqual(expected);

    expect(sorted(target.transactions)).toEqual(
      sorted(expectedTransactions(target.outcomes)),
    );
    expect(
      target.transactions.every(
        ({ operation }) => operation === 'production.route_order',
      ),
    ).toBe(true);

    const firstTargetSignal = target.trace.indexOf('signal');
    if (firstTargetSignal >= 0)
      expect(target.trace.slice(0, firstTargetSignal)).toContain('transaction');

    const freshCommit = target.outcomes.some(
      (outcome) =>
        outcome.kind === 'success' &&
        record(outcome.value)?.['replayed'] === false,
    );
    expect(target.clockReads).toBe(
      freshCommit || scenario.mutation === 'receipt_id_collision' ? 1 : 0,
    );
    const targetBefore = record(target.before);
    const targetAfter = record(target.after);
    const beforeEvents = Array.isArray(targetBefore?.['events'])
      ? targetBefore['events'].length
      : 0;
    const afterEvents = Array.isArray(targetAfter?.['events'])
      ? targetAfter['events'].length
      : 0;
    const beforeLocations = Array.isArray(targetBefore?.['locations'])
      ? targetBefore['locations']
      : [];
    const afterLocations = Array.isArray(targetAfter?.['locations'])
      ? targetAfter['locations']
      : [];
    const beforeLocation = record(beforeLocations[0]);
    const afterLocation = record(afterLocations[0]);
    expect(afterEvents - beforeEvents).toBe(freshCommit ? 1 : 0);
    expect(
      Number(afterLocation?.['liveRevision']) -
        Number(beforeLocation?.['liveRevision']),
    ).toBe(freshCommit ? 1 : 0);
    if (!freshCommit)
      expect(normalizeState(target.after, scenario)).toEqual(
        normalizeState(target.before, scenario),
      );
  });
});
