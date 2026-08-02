import {
  desc,
  eq,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { invariantViolationError } from '@pressly/errors';
import type { PublishSchedulerConfigRepository } from './publish-scheduler-config.port.ts';
import { mapConfig, asDate } from '../persistence/production-mappers.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

export const makePublishSchedulerConfigRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): PublishSchedulerConfigRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    nextSchedulerConfigVersion: async (locationId) => {
      const [latest] = await db
        .select({ version: laundryProduction.schedulerConfigs.version })
        .from(laundryProduction.schedulerConfigs)
        .where(eq(laundryProduction.schedulerConfigs.locationId, locationId))
        .orderBy(desc(laundryProduction.schedulerConfigs.version))
        .limit(1);
      return (latest?.version ?? 0) + 1;
    },
    saveSchedulerConfig: async (locationId, config) => {
      const [row] = await db
        .insert(laundryProduction.schedulerConfigs)
        .values({
          id: config.id,
          locationId,
          pulseMinutes: config.pulseMinutes,
          foldLbsPerFolderMinute: config.foldLbsPerFolderMinute,
          algorithmVersion: config.algorithmVersion,
          version: config.version,
          stageFitAssertion: config.stageFitAssertion,
          assertedBy: config.stageFitAssertion.assertedBy,
          publishedAt: asDate(config.publishedAt),
        })
        .returning();
      if (row === undefined)
        throw productionInvariantViolation(
          'production_scheduler_config_insert_return_missing',
          'Scheduler config insert failed.',
        );
      return mapConfig(row);
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
