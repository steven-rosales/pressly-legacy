import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { placeOrderExactlyContract } from './contract.ts';
import {
  appendOnlineOrderPlacementWorkEvent,
  findOnlineOrderPlacementWorkEventPayload,
} from '../../../postgres/online-order-placement/work-event.postgres.ts';
import type { PlaceOrderExactlyWorkEventInput } from './execute.ts';
import {
  serializePlaceOrderExactlyWorkEventCommand,
  type StoredPlaceOrderExactlyWorkEvent,
} from './idempotency.ts';

const envelopeKey = '_idempotency';

export const findPlaceOrderExactlyWorkEvent = async (
  database: PostgresExecutor,
  schema: ProductionSchema,
  key: string,
): Promise<StoredPlaceOrderExactlyWorkEvent | null> => {
  const payload = await findOnlineOrderPlacementWorkEventPayload(
    database,
    schema,
    key,
  );
  if (payload === null) return null;
  return decodeStoredCellWorkEvent(placeOrderExactlyContract.output, payload);
};

const serializedResult = (
  result: PlaceOrderExactlyWorkEventInput['idempotency']['result'],
): JsonObject => {
  switch (result.status) {
    case 'placed':
      return {
        ...result,
        affectedBatchIds: [...result.affectedBatchIds],
      };
    case 'confirmation_required':
      return {
        ...result,
        target: { ...result.target },
        affectedBatchIds: [...result.affectedBatchIds],
      };
    case 'not_placed':
      return { ...result };
  }
};

export const appendPlaceOrderExactlyWorkEvent = async (
  database: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: PlaceOrderExactlyWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    productionRunId: event.payload.productionRunId,
    authorizedAction: event.payload.authorizedAction,
    mode: event.payload.mode,
    targetBatchId: event.payload.targetBatchId,
    proposalHash: event.payload.proposalHash,
    queueVersion: event.payload.queueVersion,
    outcome: event.payload.outcome,
    [envelopeKey]: {
      version: 1,
      command: serializePlaceOrderExactlyWorkEventCommand(
        event.idempotency.command,
      ),
      result: serializedResult(event.idempotency.result),
    },
  };
  await appendOnlineOrderPlacementWorkEvent(database, schema, ids, {
    ...event,
    payload,
  });
};
