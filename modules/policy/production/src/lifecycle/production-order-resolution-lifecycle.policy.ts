import { result, stateMachine, type Result } from '@pressly/kernel';

export const productionOrderResolutionStates = [
  'open',
  'resolved_without_production',
] as const;

export type ProductionOrderResolutionState =
  (typeof productionOrderResolutionStates)[number];
export type ProductionOrderResolutionEvent =
  | 'resolve_without_production'
  | 'restore';

export type ProductionOrderResolutionDecision = Readonly<{
  from: ProductionOrderResolutionState;
  state: ProductionOrderResolutionState;
}>;

export type ProductionOrderResolutionRejection = Readonly<{
  code:
    | 'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID'
    | 'PRODUCTION_ORDER_RESOLUTION_EVENT_NOT_ALLOWED';
  message: string;
}>;

type ResolutionEntity = Readonly<{ state: string }>;
type ResolutionEvent = Readonly<{ type: ProductionOrderResolutionEvent }>;

const resolutionInitialState = 'open' as const;

const resolutionMachine = stateMachine.define<
  typeof productionOrderResolutionStates,
  ResolutionEvent,
  ResolutionEntity,
  undefined
>({
  name: 'production-order-resolution',
  states: productionOrderResolutionStates,
  initial: resolutionInitialState,
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    {
      from: 'open',
      on: 'resolve_without_production',
      to: 'resolved_without_production',
      description:
        'Remove never-produced work from active operations without deleting or finishing it.',
    },
    {
      from: 'resolved_without_production',
      on: 'restore',
      to: 'open',
      description:
        'Restore retained never-produced work to active operational evaluation.',
    },
  ],
});

const isResolutionState = (
  state: string,
): state is ProductionOrderResolutionState =>
  (productionOrderResolutionStates as readonly string[]).includes(state);

export const initialProductionOrderResolutionState = resolutionInitialState;

export const evaluateProductionOrderResolutionTransition = (input: {
  state: string;
  event: ProductionOrderResolutionEvent;
}): Result<
  ProductionOrderResolutionDecision,
  ProductionOrderResolutionRejection
> => {
  const transition = resolutionMachine.transition(
    { state: input.state },
    { type: input.event },
    undefined,
  );

  if (transition.tag === 'err')
    return result.err(
      transition.error.kind === 'unknown_state'
        ? {
            code: 'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID',
            message: 'The production order resolution state is invalid.',
          }
        : {
            code: 'PRODUCTION_ORDER_RESOLUTION_EVENT_NOT_ALLOWED',
            message: 'The production order resolution event is not allowed.',
          },
    );

  return result.ok({
    from: transition.value.from,
    state: transition.value.to,
  });
};

export const allowedProductionOrderResolutionEvents = (
  state: string,
): readonly ProductionOrderResolutionEvent[] =>
  isResolutionState(state) ? resolutionMachine.allowedEvents(state) : [];

export const productionOrderResolutionGraph = resolutionMachine.graph;

export type ProductionOrderOperationalAccessRejection = Readonly<{
  code:
    | 'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID'
    | 'PRODUCTION_ORDER_RESOLVED';
  message: string;
}>;

export const evaluateProductionOrderOperationalAccess = (input: {
  resolutionState: string;
}): Result<
  Readonly<{ resolutionState: 'open' }>,
  ProductionOrderOperationalAccessRejection
> => {
  if (!isResolutionState(input.resolutionState))
    return result.err({
      code: 'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID',
      message: 'The production order resolution state is invalid.',
    });
  if (input.resolutionState === 'resolved_without_production')
    return result.err({
      code: 'PRODUCTION_ORDER_RESOLVED',
      message: 'This order is archived from active production work.',
    });
  return result.ok({ resolutionState: 'open' });
};

export const productionOrderResolutionReviewReasons = [
  'intake_recorded',
  'manual_admission',
  'priority',
  'pending_placement',
] as const;

export type ProductionOrderResolutionReviewReason =
  (typeof productionOrderResolutionReviewReasons)[number];

export const productionOrderResolutionBlockReasons = [
  'execution_committed',
  'selected_for_shift',
  'batch_membership_exists',
  'stage_attempt_exists',
  'route_exists',
] as const;

export type ProductionOrderResolutionBlockReason =
  (typeof productionOrderResolutionBlockReasons)[number];

export type ProductionOrderResolutionGuardInput = Readonly<{
  executionState: 'unassigned' | 'scheduled' | 'finished';
  hasShiftSelection: boolean;
  hasBatchMembership: boolean;
  hasStageAttempt: boolean;
  hasRoute: boolean;
  hasIntake: boolean;
  hasManualAdmission: boolean;
  isPriority: boolean;
  hasPendingPlacement: boolean;
}>;

export type ProductionOrderResolutionGuardDecision =
  | Readonly<{
      status: 'allowed';
      requiresExplicitReview: boolean;
      reviewReasons: readonly ProductionOrderResolutionReviewReason[];
      mayClearPendingPlacement: boolean;
    }>
  | Readonly<{
      status: 'blocked';
      blockReasons: readonly ProductionOrderResolutionBlockReason[];
    }>;

/**
 * Classifies cross-lifecycle facts without creating a second transition table.
 * The resolution graph remains the sole owner of persistent state changes.
 */
export const evaluateProductionOrderResolutionGuard = (
  input: ProductionOrderResolutionGuardInput,
): ProductionOrderResolutionGuardDecision => {
  const blockReasons: ProductionOrderResolutionBlockReason[] = [];
  if (input.executionState !== 'unassigned')
    blockReasons.push('execution_committed');
  if (input.hasShiftSelection) blockReasons.push('selected_for_shift');
  if (input.hasBatchMembership) blockReasons.push('batch_membership_exists');
  if (input.hasStageAttempt) blockReasons.push('stage_attempt_exists');
  if (input.hasRoute) blockReasons.push('route_exists');

  if (blockReasons.length > 0)
    return {
      status: 'blocked',
      blockReasons,
    };

  const reviewReasons: ProductionOrderResolutionReviewReason[] = [];
  if (input.hasIntake) reviewReasons.push('intake_recorded');
  if (input.hasManualAdmission) reviewReasons.push('manual_admission');
  if (input.isPriority) reviewReasons.push('priority');
  if (input.hasPendingPlacement) reviewReasons.push('pending_placement');

  return {
    status: 'allowed',
    requiresExplicitReview: reviewReasons.length > 0,
    reviewReasons,
    mayClearPendingPlacement: input.hasPendingPlacement,
  };
};
