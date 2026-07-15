import { result, type Result } from '@pressly/kernel';

type Rejection = Readonly<{ code: string; message: string }>;

export type PlacementCommitInput = Readonly<{
  runStatus: string;
  orderStatus: string;
  orderAlreadyAssigned: boolean;
  expectedQueueVersion: number;
  actualQueueVersion: number;
  placementType: 'automatic' | 'manager_exact';
  actorRole: string;
  orderWeightLbs: number;
  pulseCapacityLbs: number;
  overtime: Readonly<{
    required: boolean;
    proposalHash: string;
    confirmation: Readonly<{
      proposalHash: string;
      queueVersion: number;
    }> | null;
  }>;
}>;

const canOperate = (role: string): boolean =>
  role === 'operator' || role === 'owner' || role === 'admin';

const canManage = (role: string): boolean =>
  role === 'owner' || role === 'admin';

export const evaluatePlacementCommit = (
  input: PlacementCommitInput,
): Result<Readonly<{ commit: true }>, Rejection> => {
  if (input.runStatus !== 'started')
    return result.err({
      code: 'PRODUCTION_RUN_NOT_STARTED',
      message: 'New work can be placed only into a started production run.',
    });

  if (input.orderStatus !== 'eligible')
    return result.err({
      code: 'ORDER_NOT_ELIGIBLE',
      message: 'Only eligible production work may be placed.',
    });

  if (input.orderAlreadyAssigned)
    return result.err({
      code: 'ORDER_ALREADY_PLACED',
      message: 'An order may have only one active production batch membership.',
    });

  if (input.expectedQueueVersion !== input.actualQueueVersion)
    return result.err({
      code: 'QUEUE_VERSION_CONFLICT',
      message: 'The production queue changed before placement committed.',
    });

  if (!Number.isFinite(input.orderWeightLbs) || input.orderWeightLbs <= 0)
    return result.err({
      code: 'ORDER_WEIGHT_INVALID',
      message: 'Order weight must be positive and finite.',
    });

  if (
    !Number.isFinite(input.pulseCapacityLbs) ||
    input.pulseCapacityLbs <= 0 ||
    input.orderWeightLbs > input.pulseCapacityLbs
  )
    return result.err({
      code: 'BATCH_CAPACITY_EXCEEDED',
      message: 'Placement cannot override hard pulse capacity.',
    });

  if (input.placementType === 'manager_exact') {
    if (!canManage(input.actorRole))
      return result.err({
        code: 'EXACT_PLACEMENT_FORBIDDEN',
        message: 'Only an owner or administrator may place an exact batch pin.',
      });
  } else if (!canOperate(input.actorRole))
    return result.err({
      code: 'AUTOMATIC_PLACEMENT_FORBIDDEN',
      message: 'This actor cannot place eligible production work.',
    });

  if (!input.overtime.required) return result.ok({ commit: true });

  if (input.overtime.confirmation === null)
    return result.err({
      code: 'OVERTIME_CONFIRMATION_REQUIRED',
      message: 'A manager must explicitly accept the projected overtime.',
    });

  if (!canManage(input.actorRole))
    return result.err({
      code: 'OVERTIME_CONFIRMATION_FORBIDDEN',
      message: 'Only an owner or administrator may accept overtime.',
    });

  if (
    input.overtime.confirmation.proposalHash !== input.overtime.proposalHash ||
    input.overtime.confirmation.queueVersion !== input.actualQueueVersion
  )
    return result.err({
      code: 'OVERTIME_CONFIRMATION_STALE',
      message: 'Overtime acceptance does not match the current queue proposal.',
    });

  return result.ok({ commit: true });
};
