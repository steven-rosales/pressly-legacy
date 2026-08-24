import type { TestDatabaseRuntime } from '@pressly/testkit/database';
import {
  makeAdvanceStageIdSource,
  makeFixedClock,
  readAdvanceStageReadback,
  seedAdvanceStageFixture,
} from './advance-stage-fixture.ts';
import { makeAdvanceStageSignalRecorder } from './advance-stage-signal-recorder.ts';
import { makeDeterministicPreLockMissBarrier } from './advance-stage-synchronization.ts';
import { makeProductionSystemPostgresAdvanceStageRunner } from './production-system-postgres-target-runner.ts';
import type {
  AdvanceStageObservation,
  AdvanceStageScenario,
} from './advance-stage-types.ts';

export const observeAdvanceStageScenario = async (
  database: TestDatabaseRuntime,
  scenario: AdvanceStageScenario,
): Promise<AdvanceStageObservation> => {
  await database.reset();
  const stageRunId = await seedAdvanceStageFixture(
    database.db,
    scenario.fixture,
  );
  const idempotencyKey = scenario.commands[0]?.idempotencyKey ?? '';
  const before = await readAdvanceStageReadback(database.db, {
    stageRunId,
    idempotencyKey,
  });
  const signalRecorder = makeAdvanceStageSignalRecorder();
  const preLockMissBarrier =
    scenario.executionMode === 'concurrent'
      ? makeDeterministicPreLockMissBarrier(scenario.commands.length)
      : undefined;
  const runner = makeProductionSystemPostgresAdvanceStageRunner({
    db: database.db,
    clock: makeFixedClock(scenario.now),
    ids: makeAdvanceStageIdSource(),
    signals: signalRecorder.signals,
    transactionSignals: signalRecorder.transactions,
    ...(preLockMissBarrier === undefined ? {} : { preLockMissBarrier }),
  });
  const outcome = await runner(scenario.commands, scenario.executionMode);
  const after = await readAdvanceStageReadback(database.db, {
    stageRunId,
    idempotencyKey,
  });

  return Object.freeze({
    outcome,
    stateDelta: Object.freeze({ before: before.state, after: after.state }),
    auditEvents: after.auditEvents,
    idempotencyReceipt: after.idempotencyReceipt,
    liveRevision: Object.freeze({
      before: before.liveRevision,
      after: after.liveRevision,
    }),
    signals: signalRecorder.read(),
    execution: Object.freeze({
      mode: scenario.executionMode,
      initialIdempotencyMisses: preLockMissBarrier?.initialMissCount() ?? 0,
    }),
  });
};
