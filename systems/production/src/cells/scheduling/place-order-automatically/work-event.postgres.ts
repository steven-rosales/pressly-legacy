import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { placeOrderAutomaticallyContract } from './contract.ts';
import {
  appendOnlineOrderPlacementWorkEvent,
  findOnlineOrderPlacementWorkEventPayload,
} from '../../../postgres/online-order-placement/work-event.postgres.ts';
import type { PlaceOrderAutomaticallyWorkEventInput } from './execute.ts';
import {
  serializePlaceOrderAutomaticallyWorkEventCommand,
  type StoredPlaceOrderAutomaticallyWorkEvent,
} from './idempotency.ts';
import type { AutomaticProductionOrderPlacementResult } from './types.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findPlaceOrderAutomaticallyWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredPlaceOrderAutomaticallyWorkEvent | null> => {
  const payload = await findOnlineOrderPlacementWorkEventPayload(
    db,
    schema,
    idempotencyKey,
  );
  if (payload === null) return null;
  return decodeStoredCellWorkEvent(
    placeOrderAutomaticallyContract.output,
    payload,
  );
};

const serializeResult = (
  value: AutomaticProductionOrderPlacementResult,
): JsonObject => {
  switch (value.status) {
    case 'placed':
      return {
        status: value.status,
        mode: value.mode,
        productionRunId: value.productionRunId,
        productionOrderId: value.productionOrderId,
        productionBatchId: value.productionBatchId,
        createdBatch: value.createdBatch,
        affectedBatchIds: [...value.affectedBatchIds],
        queueVersion: value.queueVersion,
        proposalHash: value.proposalHash,
        plannedCompletionAt: value.plannedCompletionAt,
        overtimeMinutes: value.overtimeMinutes,
        replayed: value.replayed,
      };
    case 'confirmation_required':
      return {
        status: value.status,
        mode: value.mode,
        productionRunId: value.productionRunId,
        productionOrderId: value.productionOrderId,
        target: { ...value.target },
        affectedBatchIds: [...value.affectedBatchIds],
        queueVersion: value.queueVersion,
        proposalHash: value.proposalHash,
        projectedCompletionAt: value.projectedCompletionAt,
        overtimeMinutes: value.overtimeMinutes,
        replayed: value.replayed,
      };
    case 'not_placed':
      return {
        status: value.status,
        mode: value.mode,
        productionRunId: value.productionRunId,
        productionOrderId: value.productionOrderId,
        reason: value.reason,
        message: value.message,
        queueVersion: value.queueVersion,
        replayed: value.replayed,
      };
  }
};

export const appendPlaceOrderAutomaticallyWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: PlaceOrderAutomaticallyWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    ...event.payload,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializePlaceOrderAutomaticallyWorkEventCommand(
        event.idempotency.command,
      ),
      result: serializeResult(event.idempotency.result),
    },
  };
  await appendOnlineOrderPlacementWorkEvent(db, schema, ids, {
    ...event,
    payload,
  });
};
