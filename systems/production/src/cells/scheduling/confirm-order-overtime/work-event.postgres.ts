import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { confirmOrderOvertimeContract } from './contract.ts';
import {
  appendOnlineOrderPlacementWorkEvent,
  findOnlineOrderPlacementWorkEventPayload,
} from '../../../postgres/online-order-placement/work-event.postgres.ts';
import type { ConfirmOrderOvertimeWorkEventInput } from './execute.ts';
import {
  serializeConfirmOrderOvertimeWorkEventCommand,
  type StoredConfirmOrderOvertimeWorkEvent,
} from './idempotency.ts';
import type { ConfirmOrderOvertimeTransactionResult } from './types.ts';

const envelopeKey = '_idempotency';

export const findConfirmOrderOvertimeWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  key: string,
): Promise<StoredConfirmOrderOvertimeWorkEvent | null> => {
  const payload = await findOnlineOrderPlacementWorkEventPayload(
    db,
    schema,
    key,
  );
  if (payload === null) return null;
  return decodeStoredCellWorkEvent(
    confirmOrderOvertimeContract.output,
    payload,
  );
};

const serializeResult = (
  value: ConfirmOrderOvertimeTransactionResult,
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
  }
};

export const appendConfirmOrderOvertimeWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: ConfirmOrderOvertimeWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    ...event.payload,
    [envelopeKey]: {
      version: 1,
      command: serializeConfirmOrderOvertimeWorkEventCommand(
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
