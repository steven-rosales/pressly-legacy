import { schedulingProductionSystemDependencies } from './support/production-system-dependencies.ts';
import type { IdSource } from '@pressly/cells/id-source';
import {
  makeProductionSystem,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import type { PublishSchedulerConfigCommand } from '@pressly/production-system/operations/scheduling/publish-scheduler-config/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  capturePublishSchedulerConfigOutcome,
  makePublishSchedulerConfigConformanceCommand,
  publishSchedulerConfigConformanceIds as ids,
  publishSchedulerConfigConformanceLocationId as locationId,
  publishSchedulerConfigConformanceScenarios,
  publishSchedulerConfigOutcomeCode,
  type PublishSchedulerConfigDatabaseCall,
  type PublishSchedulerConfigConformanceScenario,
  type PublishSchedulerConfigObservation,
  type PublishSchedulerConfigTransactionObservation,
} from '../src/public.ts';
import {
  createPublishSchedulerConfigConformanceDatabase,
  readPublishSchedulerConfigState,
  seedPublishSchedulerConfigConformance,
  trackedPublishSchedulerConfigDatabase,
} from './support/publish-scheduler-config-conformance-fixture.ts';

const database = createPublishSchedulerConfigConformanceDatabase();

beforeAll(database.check);
afterAll(database.close);

const now = new Date('2026-08-22T14:00:00.000Z');

const trackedClock = () => {
  let reads = 0;
  return Object.freeze({
    clock: Object.freeze({
      now: () => {
        reads += 1;
        return now;
      },
    }),
    reads: () => reads,
  });
};

const trackedIds = (values: readonly string[]) => {
  const readValues: string[] = [];
  const source: IdSource = Object.freeze({
    next: () => {
      const value =
        values[readValues.length] ??
        `36000000-0000-4000-8000-${String(readValues.length + 1).padStart(12, '0')}`;
      readValues.push(value);
      return value;
    },
  });
  return Object.freeze({ source, read: () => Object.freeze([...readValues]) });
};

type Variant = Readonly<{
  execute: (command: PublishSchedulerConfigCommand) => Promise<unknown>;
  clockReads: () => number;
  idValues: () => readonly string[];
}>;

const makeVariant = (input: {
  calls: PublishSchedulerConfigDatabaseCall[];
  telemetry: PublishSchedulerConfigTransactionObservation[];
  generatedIds: readonly string[];
  afterVersionRead?: () => Promise<void>;
  onAdvisoryLockRequest?: () => void;
}): Variant => {
  const clock = trackedClock();
  const identifiers = trackedIds(input.generatedIds);
  const db = trackedPublishSchedulerConfigDatabase({
    database: database.db,
    calls: input.calls,
    ...(input.afterVersionRead === undefined
      ? {}
      : { afterVersionRead: input.afterVersionRead }),
    ...(input.onAdvisoryLockRequest === undefined
      ? {}
      : { onAdvisoryLockRequest: input.onAdvisoryLockRequest }),
  });

  const observeCellUnitOfWork: ProductionSystemUnitOfWorkObserver = (
    operation,
    unitOfWork,
  ) => {
    if (operation !== 'production.publish_scheduler_config') return unitOfWork;
    const observed: typeof unitOfWork = Object.freeze({
      transaction: async (work) => {
        try {
          const outcome = await unitOfWork.transaction(work);
          input.telemetry.push({
            operation,
            outcome: outcome.tag === 'ok' ? 'committed' : 'expected_rollback',
          });
          return outcome;
        } catch (error) {
          input.telemetry.push({ operation, outcome: 'failed' });
          throw error;
        }
      },
    });
    return observed;
  };
  const system = makeProductionSystem({
    ...schedulingProductionSystemDependencies(),

    db,
    clock: clock.clock,
    ids: identifiers.source,
    observeCellUnitOfWork,
  });
  return Object.freeze({
    execute: system.cells.publishSchedulerConfig.execute,
    clockReads: clock.reads,
    idValues: identifiers.read,
  });
};

const observeSequential = async (
  scenario: PublishSchedulerConfigConformanceScenario,
): Promise<PublishSchedulerConfigObservation> => {
  await database.reset();
  await seedPublishSchedulerConfigConformance(database.db, scenario.fixture);
  const before = await readPublishSchedulerConfigState(database.db);
  const calls: PublishSchedulerConfigDatabaseCall[] = [];
  const telemetry: PublishSchedulerConfigTransactionObservation[] = [];
  const variant = makeVariant({
    calls,
    telemetry,
    generatedIds: scenario.generatedIds,
  });
  const outcomes = [];
  for (const command of scenario.commands)
    outcomes.push(
      await capturePublishSchedulerConfigOutcome(variant.execute, command),
    );
  return Object.freeze({
    requests: Object.freeze([...scenario.commands]),
    outcomes: Object.freeze(outcomes),
    before,
    after: await readPublishSchedulerConfigState(database.db),
    clockReads: variant.clockReads(),
    idValues: variant.idValues(),
    databaseCalls: Object.freeze([...calls]),
    transactionTelemetry: Object.freeze([...telemetry]),
  });
};

const transactionCount = (
  calls: readonly PublishSchedulerConfigDatabaseCall[],
  call: PublishSchedulerConfigDatabaseCall,
): number => calls.filter((candidate) => candidate === call).length;

const expectedCreatedConfig = Object.freeze({
  id: ids.createdConfig,
  locationId,
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  algorithmVersion: 'fixed-pulse-ffd-v2',
  version: 8,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
    assertedBy: ids.actor,
    assertedAt: now.toISOString(),
  },
  assertedBy: ids.actor,
  publishedAt: now.toISOString(),
});

const expectedCreatedResult = Object.freeze({
  id: ids.createdConfig,
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  algorithmVersion: 'fixed-pulse-ffd-v2',
  version: 8,
  stageFitAssertion: {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
    assertedBy: ids.actor,
    assertedAt: now.toISOString(),
  },
  publishedAt: now.toISOString(),
});

describe('production.publish-scheduler-config.v1 permanent PostgreSQL conformance', () => {
  it.each(publishSchedulerConfigConformanceScenarios)(
    '$name',
    async (scenario) => {
      const target = await observeSequential(scenario);

      expect(target.requests).toEqual(scenario.commands);
      expect(target.outcomes.map(publishSchedulerConfigOutcomeCode)).toEqual(
        scenario.expectedOutcomeCodes,
      );
      expect(target.after.configs.length - target.before.configs.length).toBe(
        scenario.expectedConfigDelta,
      );
      expect(
        target.after.workEvents.length - target.before.workEvents.length,
      ).toBe(scenario.expectedWorkEventDelta);
      expect(target.after.liveRevision).toBe(
        target.before.liveRevision + scenario.expectedWorkEventDelta,
      );
      expect(target.clockReads).toBe(scenario.expectedClockReads);
      expect(target.idValues).toHaveLength(scenario.expectedIdReads);
      expect(target.databaseCalls).toEqual(scenario.expectedDatabaseCalls);
      expect(transactionCount(target.databaseCalls, 'find_work_event')).toBe(
        transactionCount(scenario.expectedDatabaseCalls, 'find_work_event'),
      );
      expect(transactionCount(target.databaseCalls, 'execute_sql')).toBe(
        transactionCount(scenario.expectedDatabaseCalls, 'execute_sql'),
      );

      expect(target.transactionTelemetry).toHaveLength(
        transactionCount(target.databaseCalls, 'transaction'),
      );
      expect(
        target.transactionTelemetry.every(
          ({ operation }) =>
            operation === 'production.publish_scheduler_config',
        ),
      ).toBe(true);

      if (scenario.expectedConfigDelta === 1) {
        expect(target.after.configs.at(-1)).toEqual(expectedCreatedConfig);
        expect(target.after.idempotencyReceipts).toEqual([
          {
            version: 1,
            command: {
              operation: 'scheduler_config_published',
              locationId,
              actorId: ids.actor,
              target: { entityType: 'scheduler_config', entityId: null },
              expectedVersion: null,
              payload: {
                pulseMinutes: 56,
                foldLbsPerFolderMinute: 2,
                stageFitAssertion: {
                  sortingFits: true,
                  washingFits: true,
                  dryingFits: true,
                },
              },
            },
            result: expectedCreatedResult,
          },
        ]);
      } else if (scenario.fixture !== 'late-event-collision') {
        expect(target.after).toEqual(target.before);
      }

      if (scenario.commands.length === 2) {
        expect(
          transactionCount(
            target.databaseCalls,
            'next_scheduler_config_version',
          ),
        ).toBe(1);
        const first = target.outcomes[0];
        const second = target.outcomes[1];
        if (scenario.expectedOutcomeCodes[1] === 'success') {
          expect(first).toEqual({
            kind: 'success',
            value: expectedCreatedResult,
          });
          expect(second).toEqual(first);
        }
      }

      if (scenario.fixture === 'late-event-collision') {
        expect(target.after).toEqual(target.before);
        expect(target.transactionTelemetry).toEqual([
          {
            operation: 'production.publish_scheduler_config',
            outcome: 'failed',
          },
        ]);
      }
    },
  );
});

const raceObservation =
  async (): Promise<PublishSchedulerConfigObservation> => {
    await database.reset();
    await seedPublishSchedulerConfigConformance(database.db, 'baseline');
    const before = await readPublishSchedulerConfigState(database.db);
    const calls: PublishSchedulerConfigDatabaseCall[] = [];
    const telemetry: PublishSchedulerConfigTransactionObservation[] = [];

    let observeWinnerVersionRead: (() => void) | undefined;
    const winnerReadVersion = new Promise<void>((resolve) => {
      observeWinnerVersionRead = resolve;
    });
    let releaseWinner: (() => void) | undefined;
    const holdWinner = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    let observeLoserLockRequest: (() => void) | undefined;
    const loserRequestedLock = new Promise<void>((resolve) => {
      observeLoserLockRequest = resolve;
    });

    const winner = makeVariant({
      calls,
      telemetry,
      generatedIds: [ids.raceWinnerConfig, ids.raceWinnerEvent],
      afterVersionRead: async () => {
        observeWinnerVersionRead?.();
        await holdWinner;
      },
    });
    const loser = makeVariant({
      calls,
      telemetry,
      generatedIds: [ids.raceLoserConfig, ids.raceLoserEvent],
      onAdvisoryLockRequest: () => observeLoserLockRequest?.(),
    });
    const winnerCommand = makePublishSchedulerConfigConformanceCommand({
      idempotencyKey: 'publish-scheduler-config-race-winner',
    });
    const loserCommand = makePublishSchedulerConfigConformanceCommand({
      idempotencyKey: 'publish-scheduler-config-race-loser',
    });

    const winnerOutcome = capturePublishSchedulerConfigOutcome(
      winner.execute,
      winnerCommand,
    );
    await winnerReadVersion;
    const loserOutcome = capturePublishSchedulerConfigOutcome(
      loser.execute,
      loserCommand,
    );
    await loserRequestedLock;
    releaseWinner?.();
    const outcomes = await Promise.all([winnerOutcome, loserOutcome]);

    return Object.freeze({
      requests: Object.freeze([winnerCommand, loserCommand]),
      outcomes: Object.freeze(outcomes),
      before,
      after: await readPublishSchedulerConfigState(database.db),
      clockReads: winner.clockReads() + loser.clockReads(),
      idValues: Object.freeze([...winner.idValues(), ...loser.idValues()]),
      databaseCalls: Object.freeze([...calls]),
      transactionTelemetry: Object.freeze([...telemetry]),
    });
  };

describe('production.publish-scheduler-config.v1 concurrent distinct-key serialization', () => {
  it('commits two ordered versions and events without a lost update', async () => {
    const target = await raceObservation();

    expect(target.outcomes.map(publishSchedulerConfigOutcomeCode)).toEqual([
      'success',
      'success',
    ]);
    expect(target.after.configs.length - target.before.configs.length).toBe(2);
    expect(target.after.configs.slice(-2)).toMatchObject([
      {
        id: ids.raceWinnerConfig,
        locationId,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 8,
      },
      {
        id: ids.raceLoserConfig,
        locationId,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 9,
      },
    ]);
    expect(
      target.after.workEvents.length - target.before.workEvents.length,
    ).toBe(2);
    expect(target.after.workEvents.slice(-2)).toMatchObject([
      {
        id: ids.raceWinnerEvent,
        idempotencyKey: 'publish-scheduler-config-race-winner',
      },
      {
        id: ids.raceLoserEvent,
        idempotencyKey: 'publish-scheduler-config-race-loser',
      },
    ]);
    expect(target.after.idempotencyReceipts).toHaveLength(2);
    expect(target.after.liveRevision).toBe(target.before.liveRevision + 2);
    expect(target.clockReads).toBe(2);
    expect(target.idValues).toEqual([
      ids.raceWinnerConfig,
      ids.raceWinnerEvent,
      ids.raceLoserConfig,
      ids.raceLoserEvent,
    ]);
    expect(target.databaseCalls).toEqual([
      'transaction',
      'find_work_event',
      'execute_sql',
      'find_work_event',
      'next_scheduler_config_version',
      'transaction',
      'find_work_event',
      'execute_sql',
      'save_scheduler_config',
      'append_work_event',
      'find_work_event',
      'next_scheduler_config_version',
      'save_scheduler_config',
      'append_work_event',
    ]);
    expect(target.transactionTelemetry).toEqual([
      {
        operation: 'production.publish_scheduler_config',
        outcome: 'committed',
      },
      {
        operation: 'production.publish_scheduler_config',
        outcome: 'committed',
      },
    ]);
  });
});
