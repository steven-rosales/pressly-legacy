import type { ProductionPlacementFailureReason } from './production-placement.model.ts';

export const productionPlacementFailureReason = (
  code: string,
): ProductionPlacementFailureReason => {
  switch (code) {
    case 'PRODUCTION_RUN_NOT_STARTED':
      return 'run_not_started';
    case 'PRODUCTION_RUN_COMPLETED':
      return 'run_completed';
    case 'ORDER_NOT_ELIGIBLE':
      return 'order_not_eligible';
    case 'ORDER_ALREADY_PLACED':
      return 'order_already_scheduled';
    case 'QUEUE_VERSION_CONFLICT':
      return 'queue_conflict';
    case 'OVERTIME_CONFIRMATION_STALE':
      return 'proposal_stale';
    case 'ORDER_EXCEEDS_PULSE_CAPACITY':
    case 'TARGET_BATCH_CAPACITY_EXCEEDED':
    case 'BATCH_CAPACITY_EXCEEDED':
      return 'hard_capacity_exceeded';
    default:
      return 'no_mutable_position';
  }
};
