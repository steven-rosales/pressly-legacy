import type { PostgresTransaction } from '@pressly/postgres/client';
import { invariantViolationError } from '@pressly/errors/factories';
import type { AccessSchema } from '../../schema/public.ts';

export const recordTransition = async (
  tx: PostgresTransaction,
  auth: Pick<AccessSchema, 'authLifecycleTransitions'>,
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
  const actorId =
    actorKind === 'system' ? 'pressly.auth.lifecycle' : actorIdentityId;
  if (actorId === undefined)
    throw invariantViolationError({
      code: 'access_transition_actor_missing',
      message:
        'A human Access lifecycle transition requires an actor identity.',
      safeMessage: 'The Access lifecycle transition is invalid.',
    });
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
    actorId,
    ...(actorIdentityId === undefined ? {} : { actorIdentityId }),
    reasonCode: input.reasonCode,
    ...(input.reasonNote ? { reasonNote: input.reasonNote } : {}),
    occurredAt: input.now,
  });
};
