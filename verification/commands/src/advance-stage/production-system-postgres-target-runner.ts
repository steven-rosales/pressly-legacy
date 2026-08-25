import {
  advanceStageIdempotency,
  type StoredAdvanceStageWorkEvent,
} from '@pressly/production-system/operations/floor/advance-stage/idempotency';
import { makeAdvanceStagePolicy } from '@pressly/production-system/operations/floor/advance-stage/confirmation';
import { makeAdvanceStagePostgresRepository } from '@pressly/production-system/operations/floor/advance-stage/postgres';
import {
  makeExecuteAdvanceStage,
  type AdvanceStageRepository,
} from '@pressly/production-system/operations/floor/advance-stage/execute';
import { productionRules } from '@pressly/production-system/model';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { makeCanonicalAdvanceStageRunner } from './advance-stage-runner.ts';
import type { AdvanceStageRunnerDependencies } from './advance-stage-runner.ts';
import { makeBarrieredFindWorkEvent } from './advance-stage-synchronization.ts';
import type { AdvanceStageRunner } from './advance-stage-types.ts';

const targetPolicy = makeAdvanceStagePolicy(productionRules);

const makeTargetRepository = (
  dependencies: AdvanceStageRunnerDependencies,
): AdvanceStageRepository<StoredAdvanceStageWorkEvent> => {
  const target = makeAdvanceStagePostgresRepository(
    {
      db: dependencies.db,
      ids: dependencies.ids,
    },
    presslyPostgresOwnerSchemas.production,
  );
  return Object.freeze({
    transaction: async (work) => {
      const participant = dependencies.preLockMissBarrier?.participate();
      try {
        const outcome = await target.transaction((repository) =>
          work({
            ...repository,
            findWorkEvent: makeBarrieredFindWorkEvent(
              repository.findWorkEvent,
              participant,
            ),
          }),
        );
        dependencies.transactionSignals.recordCommittedOutcome(outcome);
        return outcome;
      } finally {
        participant?.transactionSettled();
      }
    },
  });
};

export const makeProductionSystemPostgresAdvanceStageRunner = (
  dependencies: AdvanceStageRunnerDependencies,
): AdvanceStageRunner =>
  makeCanonicalAdvanceStageRunner(
    makeExecuteAdvanceStage<StoredAdvanceStageWorkEvent>({
      repo: makeTargetRepository(dependencies),
      idempotency: advanceStageIdempotency,
      policy: targetPolicy,
      clock: dependencies.clock,
      signals: dependencies.signals,
    }),
  );
