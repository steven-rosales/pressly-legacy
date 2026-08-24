import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  UnfreezeBatchMembershipIdempotency,
  UnfreezeBatchMembershipReplay,
  UnfreezeBatchMembershipWorkEventCommand,
} from './execute.ts';
import type { UnfreezeBatchMembershipResult } from './types.ts';

export type StoredUnfreezeBatchMembershipWorkEvent =
  StoredCellWorkEvent<UnfreezeBatchMembershipResult>;

export const serializeUnfreezeBatchMembershipWorkEventCommand = (
  command: UnfreezeBatchMembershipWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: { ...command.target },
  expectedVersion: command.expectedVersion,
  payload: { ...command.payload },
});

export const resolveUnfreezeBatchMembershipReplay = (
  stored: StoredUnfreezeBatchMembershipWorkEvent | null,
  expected: UnfreezeBatchMembershipWorkEventCommand,
): UnfreezeBatchMembershipReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeUnfreezeBatchMembershipWorkEventCommand(expected))
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

export const unfreezeBatchMembershipIdempotency: UnfreezeBatchMembershipIdempotency<StoredUnfreezeBatchMembershipWorkEvent> =
  Object.freeze({ resolveReplay: resolveUnfreezeBatchMembershipReplay });
