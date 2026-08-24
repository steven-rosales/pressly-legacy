import type { ProductionRules } from '../../../model/public.ts';

export type CreateShiftCommand = Readonly<{
  locationId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  effectiveFolderCount: number;
  idempotencyKey: string;
  actorId: string;
}>;

export type ProductionShift = Readonly<{
  id: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  effectiveFolderCount: number;
  status: 'closed' | 'draft' | 'open';
  version: number;
}>;

export type CreateShiftValidationFailure = Readonly<{
  kind: 'validation';
  classification: 'semantic';
  code: 'production_shift_window_invalid';
  message: 'Shift end must be after shift start.';
  safeMessage: 'Shift end must be after shift start.';
}>;

export type CreateShiftConflictFailure = Readonly<{
  kind: 'conflict';
  code: 'production_idempotency_conflict';
  message: 'The idempotency key belongs to a different production command.';
  safeMessage: 'The idempotency key belongs to a different production command.';
}>;

export type CreateShiftExpectedFailure =
  | CreateShiftValidationFailure
  | CreateShiftConflictFailure;

export type CreateShiftPolicy = Pick<
  ProductionRules,
  'initialProductionShiftState'
>;

export type CreateShiftDecision =
  | Readonly<{ kind: 'reject'; failure: CreateShiftValidationFailure }>
  | Readonly<{
      kind: 'create';
      shift: Omit<ProductionShift, 'id'>;
    }>;
