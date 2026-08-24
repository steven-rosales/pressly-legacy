import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { createScheduleContract } from './contract.ts';
import type { ScheduleProposal } from '../../../model/production-schedule/model.ts';
import type { CreateScheduleWorkEventInput } from './execute.ts';
import {
  serializeCreateScheduleCommand,
  type StoredCreateScheduleWorkEvent,
} from './idempotency.ts';
const key = '_idempotency';
export const proposalJson = (value: ScheduleProposal): JsonObject => ({
  scheduleRunId: value.scheduleRunId,
  productionShiftId: value.productionShiftId,
  schedulerConfigId: value.schedulerConfigId,
  status: value.status,
  inputSnapshotHash: value.inputSnapshotHash,
  outputPlanHash: value.outputPlanHash,
  algorithmVersion: value.algorithmVersion,
  pulseMinutes: value.pulseMinutes,
  pulseCapacityLbs: value.pulseCapacityLbs,
  batchCount: value.batchCount,
  makespanMinutes: value.makespanMinutes,
  plannedCompletionAt: value.plannedCompletionAt,
  batches: value.batches.map((batch) => ({
    sequence: batch.sequence,
    orderIds: [...batch.orderIds],
    derivedWeightLbs: batch.derivedWeightLbs,
    bagCount: batch.bagCount,
    stages: batch.stages.map((stage) => ({
      stage: stage.stage,
      startsAt: stage.startsAt,
      endsAt: stage.endsAt,
      machineIds: [...stage.machineIds],
    })),
  })),
  unplacedOrderIds: [...value.unplacedOrderIds],
  warnings: value.warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
    blocking: warning.blocking,
    ...(warning.orderIds === undefined
      ? {}
      : { orderIds: [...warning.orderIds] }),
  })),
  createdAt: value.createdAt,
  acceptedAt: value.acceptedAt,
  acceptedBy: value.acceptedBy,
  acknowledgedWarningCodes: [...value.acknowledgedWarningCodes],
  supersededAt: value.supersededAt,
});
export const findCreateScheduleWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredCreateScheduleWorkEvent | null> => {
  const [row] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (row === undefined) return null;
  return decodeStoredCellWorkEvent(createScheduleContract.output, row.payload);
};
export const appendCreateScheduleWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: CreateScheduleWorkEventInput,
): Promise<void> => {
  await db.insert(schema.workEvents).values({
    id: ids.next(),
    locationId: event.locationId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    expectedVersion: null,
    idempotencyKey: event.idempotencyKey,
    payload: {
      ...event.payload,
      [key]: {
        version: 1,
        command: serializeCreateScheduleCommand(event.idempotency.command),
        result: proposalJson(event.idempotency.result),
      },
    },
  });
};
