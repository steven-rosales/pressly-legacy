import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  ConfirmOrderOvertimeIdempotency,
  ConfirmOrderOvertimeReplay,
  ConfirmOrderOvertimeWorkEventCommand,
} from './execute.ts';
import type { ConfirmOrderOvertimeTransactionResult } from './types.ts';

export type StoredConfirmOrderOvertimeWorkEvent =
  StoredCellWorkEvent<ConfirmOrderOvertimeTransactionResult>;

export const serializeConfirmOrderOvertimeWorkEventCommand = (
  command: ConfirmOrderOvertimeWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: { ...command.target },
  expectedVersion: command.expectedVersion,
  payload: { ...command.payload },
});

export const resolveConfirmOrderOvertimeReplay = (
  stored: StoredConfirmOrderOvertimeWorkEvent | null,
  expected: ConfirmOrderOvertimeWorkEventCommand,
): ConfirmOrderOvertimeReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeConfirmOrderOvertimeWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return {
    kind: 'replay',
    result: {
      ...stored.result,
      replayed: true,
    },
  };
};

export const confirmOrderOvertimeIdempotency: ConfirmOrderOvertimeIdempotency<StoredConfirmOrderOvertimeWorkEvent> =
  Object.freeze({ resolveReplay: resolveConfirmOrderOvertimeReplay });
