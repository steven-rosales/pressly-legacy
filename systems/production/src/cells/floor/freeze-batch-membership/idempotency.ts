import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  FreezeBatchMembershipIdempotency,
  FreezeBatchMembershipReplay,
  FreezeBatchMembershipWorkEventCommand,
} from './execute.ts';
import type { FreezeBatchMembershipResult } from './types.ts';

export type StoredFreezeBatchMembershipWorkEvent =
  StoredCellWorkEvent<FreezeBatchMembershipResult>;

export const serializeFreezeBatchMembershipWorkEventCommand = (
  command: FreezeBatchMembershipWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: { ...command.target },
  expectedVersion: command.expectedVersion,
  payload: { ...command.payload },
});

export const resolveFreezeBatchMembershipReplay = (
  stored: StoredFreezeBatchMembershipWorkEvent | null,
  expected: FreezeBatchMembershipWorkEventCommand,
): FreezeBatchMembershipReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeFreezeBatchMembershipWorkEventCommand(expected))
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

export const freezeBatchMembershipIdempotency: FreezeBatchMembershipIdempotency<StoredFreezeBatchMembershipWorkEvent> =
  Object.freeze({ resolveReplay: resolveFreezeBatchMembershipReplay });
