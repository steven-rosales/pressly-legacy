import { result, type Result } from '@pressly/kernel';

type Rejection = Readonly<{ code: string; message: string }>;

export type BatchMembershipTransitionInput = Readonly<{
  action: 'freeze' | 'unfreeze';
  batchStatus: string;
  membershipFrozen: boolean;
  actorRole: string;
}>;

const canOperate = (role: string): boolean =>
  role === 'operator' || role === 'owner' || role === 'admin';

const canManage = (role: string): boolean =>
  role === 'owner' || role === 'admin';

export const evaluateBatchMembershipTransition = (
  input: BatchMembershipTransitionInput,
): Result<Readonly<{ membershipFrozen: boolean }>, Rejection> => {
  if (input.batchStatus !== 'queued')
    return result.err({
      code: 'BATCH_MEMBERSHIP_IMMUTABLE',
      message: 'Membership cannot change after a batch leaves the queue.',
    });

  if (input.action === 'freeze') {
    if (!canOperate(input.actorRole))
      return result.err({
        code: 'BATCH_FREEZE_FORBIDDEN',
        message: 'This actor cannot freeze production batch membership.',
      });

    if (input.membershipFrozen)
      return result.err({
        code: 'BATCH_ALREADY_FROZEN',
        message: 'Production batch membership is already frozen.',
      });

    return result.ok({ membershipFrozen: true });
  }

  if (!canManage(input.actorRole))
    return result.err({
      code: 'BATCH_UNFREEZE_FORBIDDEN',
      message: 'Only an owner or administrator may unfreeze queued work.',
    });

  if (!input.membershipFrozen)
    return result.err({
      code: 'BATCH_ALREADY_MUTABLE',
      message: 'Production batch membership is already mutable.',
    });

  return result.ok({ membershipFrozen: false });
};
