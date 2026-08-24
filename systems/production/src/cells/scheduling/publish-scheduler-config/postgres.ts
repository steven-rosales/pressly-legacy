import { isJsonObject } from '@pressly/codec';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { desc, eq, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import type {
  PublishSchedulerConfigRepository,
  PublishSchedulerConfigTransactionRepository,
} from './execute.ts';
import type { StoredPublishSchedulerConfigWorkEvent } from './idempotency.ts';
import type { SchedulerConfig } from './types.ts';
import {
  appendPublishSchedulerConfigWorkEvent,
  findPublishSchedulerConfigWorkEvent,
} from './work-event.postgres.ts';

export type PublishSchedulerConfigPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

const invalidStoredStageFitAssertion = (): never => {
  throw invariantViolationError({
    code: 'production_schedule_stage_fit_assertion_invalid',
    message: 'Stored production schedule stage_fit_assertion is invalid.',
    safeMessage: 'Stored production scheduling state is inconsistent.',
  });
};

const schedulerConfigFromRow = (
  row: ProductionSchema['schedulerConfigs']['$inferSelect'],
): SchedulerConfig => {
  const assertion = row.stageFitAssertion;
  if (
    !isJsonObject(assertion) ||
    assertion['sortingFits'] !== true ||
    assertion['washingFits'] !== true ||
    assertion['dryingFits'] !== true ||
    typeof assertion['assertedBy'] !== 'string' ||
    typeof assertion['assertedAt'] !== 'string'
  )
    return invalidStoredStageFitAssertion();

  return {
    id: row.id,
    pulseMinutes: row.pulseMinutes,
    foldLbsPerFolderMinute: row.foldLbsPerFolderMinute,
    algorithmVersion:
      row.algorithmVersion as SchedulerConfig['algorithmVersion'],
    version: row.version,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
      assertedBy: assertion['assertedBy'],
      assertedAt: assertion['assertedAt'],
    },
    publishedAt: row.publishedAt.toISOString(),
  };
};

export const makePublishSchedulerConfigPostgresRepository = (
  deps: PublishSchedulerConfigPostgresDependencies,
  schema: ProductionSchema,
): PublishSchedulerConfigRepository<StoredPublishSchedulerConfigWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): PublishSchedulerConfigTransactionRepository<StoredPublishSchedulerConfigWorkEvent> => ({
      findWorkEvent: (key) =>
        findPublishSchedulerConfigWorkEvent(db, schema, key),
      lockLocationScheduling: async (locationId) => {
        await db.execute(
          sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
        );
      },
      nextSchedulerConfigVersion: async (locationId) => {
        const [latest] = await db
          .select({ version: schema.schedulerConfigs.version })
          .from(schema.schedulerConfigs)
          .where(eq(schema.schedulerConfigs.locationId, locationId))
          .orderBy(desc(schema.schedulerConfigs.version))
          .limit(1);
        return (latest?.version ?? 0) + 1;
      },
      saveSchedulerConfig: async (locationId, config) => {
        const [inserted] = await db
          .insert(schema.schedulerConfigs)
          .values({
            id: config.id,
            locationId,
            pulseMinutes: config.pulseMinutes,
            foldLbsPerFolderMinute: config.foldLbsPerFolderMinute,
            algorithmVersion: config.algorithmVersion,
            version: config.version,
            stageFitAssertion: config.stageFitAssertion,
            assertedBy: config.stageFitAssertion.assertedBy,
            publishedAt: new Date(config.publishedAt),
          })
          .returning();
        if (inserted === undefined)
          throw invariantViolationError({
            code: 'production_scheduler_config_insert_return_missing',
            message: 'Scheduler config insert failed.',
            safeMessage: 'Production state is inconsistent.',
          });
        return schedulerConfigFromRow(inserted);
      },
      appendWorkEvent: (event) =>
        appendPublishSchedulerConfigWorkEvent(db, schema, deps.ids, event),
    }),
  );
  const unitOfWork =
    deps.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;

  return Object.freeze({
    transaction: async (work) => {
      const outcome = await unitOfWork.transaction(async (repository) => {
        const cellOutcome = await work(repository);
        return cellOutcome.kind === 'success'
          ? result.ok(cellOutcome.value)
          : result.err(cellOutcome.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  });
};
