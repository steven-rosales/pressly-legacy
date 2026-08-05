import type { DatabaseTransaction } from '@pressly/db/client';
import * as auth from '@pressly/db/schema/auth';

export const recordTransition = async (
  tx: DatabaseTransaction,
  input: {
    businessId: string;
    aggregateKind: 'invitation' | 'membership' | 'access_grant';
    aggregateId: string;
    fromState: string;
    toState: string;
    eventType: string;
    aggregateVersion: number;
    idempotencyKey: string;
    commandHash: string;
    actorKind?: 'human' | 'system';
    actorIdentityId?: string;
    reasonCode: string;
    reasonNote?: string | null;
    now: Date;
  },
): Promise<void> => {
  const actorKind = input.actorKind ?? 'human';
  const actorIdentityId = input.actorIdentityId;
  await tx.insert(auth.authLifecycleTransitions).values({
    businessId: input.businessId,
    aggregateKind: input.aggregateKind,
    aggregateId: input.aggregateId,
    fromState: input.fromState,
    toState: input.toState,
    eventType: input.eventType,
    aggregateVersion: input.aggregateVersion,
    idempotencyKey: input.idempotencyKey,
    commandHash: input.commandHash,
    origin: 'pressly_control',
    actorKind,
    actorId:
      actorKind === 'system' ? 'pressly.auth.lifecycle' : actorIdentityId!,
    ...(actorIdentityId === undefined ? {} : { actorIdentityId }),
    reasonCode: input.reasonCode,
    ...(input.reasonNote ? { reasonNote: input.reasonNote } : {}),
    occurredAt: input.now,
  });
};
