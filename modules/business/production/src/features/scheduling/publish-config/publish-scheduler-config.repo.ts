import { desc, eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { invariantViolationError } from '@pressly/errors/factories';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import type { PublishSchedulerConfigRepository } from './publish-scheduler-config.port.ts';
import {
  mapConfig,
  asDate,
} from '../../../foundations/adapters/postgres/scheduling/production.persistence.mapper.ts';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

export const makePublishSchedulerConfigRepository = (deps: {
  db: Database;
  ids: IdSource;
}): PublishSchedulerConfigRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
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
