import type {
  ProductionRules,
  ScheduleRevisionLifecycleDecision,
} from '../../../model/public.ts';

export type ReplaceShiftSelectionCommand = Readonly<{
  locationId: string;
  productionShiftId: string;
  actorId: string;
  selectedOrderIds: readonly string[];
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type ProductionShiftSelection = Readonly<{
  productionShiftId: string;
  version: number;
  selectedOrderIds: readonly string[];
}>;

export type ReplaceShiftSelectionResult = Readonly<{
  selection: ProductionShiftSelection;
  supersededScheduleRunId: string | null;
  replayed: boolean;
}>;

export type ReplaceShiftSelectionIdempotencyConflictFailure = Readonly<{
  kind: 'conflict';
  code: 'production_idempotency_conflict';
  message: 'The idempotency key belongs to a different production command.';
  safeMessage: 'The idempotency key belongs to a different production command.';
}>;

export type ReplaceShiftSelectionNotFoundFailure = Readonly<{
  kind: 'not_found';
  code: 'production_shift_not_found';
  message: 'The production shift was not found.';
  safeMessage: 'The production shift was not found.';
}>;

export type ReplaceShiftSelectionStartedFailure = Readonly<{
  kind: 'conflict';
  code: 'production_shift_already_started';
  message: 'The order selection is frozen because production has started.';
  safeMessage: 'The order selection is frozen because production has started.';
}>;

export type ReplaceShiftSelectionVersionFailure = Readonly<{
  kind: 'conflict';
  code: 'production_shift_selection_version_conflict';
  message: 'The shift selection changed. Refresh it before choosing orders again.';
  safeMessage: 'The shift selection changed. Refresh it before choosing orders again.';
}>;

export type ReplaceShiftSelectionNotReadyFailure = Readonly<{
  kind: 'conflict';
  code: 'production_shift_selection_not_ready';
  message: 'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.';
  safeMessage: 'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.';
}>;

export type ReplaceShiftSelectionPlanStateFailure = Readonly<{
  kind: 'conflict';
  code: 'schedule_current_plan_state_invalid';
  message: 'The current schedule revision cannot be superseded.';
  safeMessage: 'The current schedule revision cannot be superseded.';
}>;

export type ReplaceShiftSelectionScheduleVersionFailure = Readonly<{
  kind: 'conflict';
  code: 'production_shift_selection_schedule_version_conflict';
  message: 'Current schedule revision changed unexpectedly.';
  safeMessage: 'Production state changed. Refresh and try again.';
}>;

export type ReplaceShiftSelectionExpectedFailure =
  | ReplaceShiftSelectionIdempotencyConflictFailure
  | ReplaceShiftSelectionNotFoundFailure
  | ReplaceShiftSelectionStartedFailure
  | ReplaceShiftSelectionVersionFailure
  | ReplaceShiftSelectionNotReadyFailure
  | ReplaceShiftSelectionPlanStateFailure
  | ReplaceShiftSelectionScheduleVersionFailure;

export type CurrentShiftSelectionSchedule = Readonly<{
  scheduleRunId: string;
  status: string;
}>;

export type AvailableShiftSelection = Readonly<{
  state: 'available';
  version: number;
  selectedOrderIds: readonly string[];
  currentSchedule: CurrentShiftSelectionSchedule | null;
}>;

export type LockedShiftSelection =
  | Readonly<{ state: 'not_found' }>
  | Readonly<{ state: 'run_exists' }>
  | AvailableShiftSelection;

export type ReplaceShiftSelectionPolicy = Pick<
  ProductionRules,
  'evaluateScheduleRevisionTransition'
>;

export type ShiftSelectionSupersession = Readonly<{
  scheduleRunId: string;
  lifecycle: ScheduleRevisionLifecycleDecision;
}>;

export type ShiftSelectionAccessDecision =
  | Readonly<{
      kind: 'reject';
      failure:
        | ReplaceShiftSelectionNotFoundFailure
        | ReplaceShiftSelectionStartedFailure
        | ReplaceShiftSelectionVersionFailure;
    }>
  | Readonly<{ kind: 'inspect'; current: AvailableShiftSelection }>;

export type ShiftSelectionChangeDecision =
  | Readonly<{
      kind: 'reject';
      failure:
        | ReplaceShiftSelectionNotReadyFailure
        | ReplaceShiftSelectionPlanStateFailure;
    }>
  | Readonly<{ kind: 'no_change'; result: ReplaceShiftSelectionResult }>
  | Readonly<{
      kind: 'replace';
      supersede: ShiftSelectionSupersession | null;
    }>;
