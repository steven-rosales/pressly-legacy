import type {
  ProductionRules,
  ScheduleRevisionLifecycleDecision,
} from '../../../model/public.ts';

export type ProductionShiftStatus = 'closed' | 'draft' | 'open';

export type ProductionShift = Readonly<{
  id: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  effectiveFolderCount: number;
  status: ProductionShiftStatus;
  version: number;
}>;

export type UpdateShiftCommand = Readonly<{
  locationId: string;
  productionShiftId: string;
  startsAt: string;
  endsAt: string;
  effectiveFolderCount: number;
  expectedVersion: number;
  idempotencyKey: string;
  actorId: string;
}>;

export type UpdateShiftResult = Readonly<{
  productionShift: ProductionShift;
  supersededScheduleRunId: string | null;
  replayed: boolean;
}>;

export type UpdateShiftChangedField =
  | 'effectiveFolderCount'
  | 'endsAt'
  | 'startsAt';

export type UpdateShiftCurrentSchedule = Readonly<{
  scheduleRunId: string;
  status: string;
}>;

export type UpdateShiftPolicy = Pick<
  ProductionRules,
  'evaluateScheduleRevisionTransition'
>;

export type UpdateShiftValidationFailure = Readonly<{
  kind: 'validation';
  classification: 'semantic';
  code: 'production_shift_window_invalid';
  message: string;
  safeMessage: string;
}>;

export type UpdateShiftNotFoundFailure = Readonly<{
  kind: 'not_found';
  code: 'production_shift_not_found';
  message: string;
  safeMessage: string;
}>;

export type UpdateShiftConflictFailure = Readonly<{
  kind: 'conflict';
  code:
    | 'production_idempotency_conflict'
    | 'production_shift_already_started'
    | 'production_shift_closed'
    | 'production_shift_schedule_version_conflict'
    | 'production_shift_version_conflict'
    | 'schedule_current_plan_state_invalid';
  message: string;
  safeMessage: string;
}>;

export type UpdateShiftExpectedFailure =
  | UpdateShiftConflictFailure
  | UpdateShiftNotFoundFailure
  | UpdateShiftValidationFailure;

export type UpdateShiftStateDecision =
  | Readonly<{ kind: 'reject'; failure: UpdateShiftExpectedFailure }>
  | Readonly<{
      kind: 'ready';
      current: ProductionShift;
    }>;

export type UpdateShiftEligibilityDecision =
  | Readonly<{ kind: 'reject'; failure: UpdateShiftExpectedFailure }>
  | Readonly<{
      kind: 'ready';
      changedFields: readonly UpdateShiftChangedField[];
    }>;

export type UpdateShiftSupersession = Readonly<{
  scheduleRunId: string;
  lifecycle: ScheduleRevisionLifecycleDecision;
}>;

export type UpdateShiftSupersessionDecision =
  | Readonly<{ kind: 'reject'; failure: UpdateShiftExpectedFailure }>
  | Readonly<{
      kind: 'ready';
      supersession: UpdateShiftSupersession | null;
    }>;
