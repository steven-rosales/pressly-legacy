import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  ChangeProductionAdmissionCommand,
  ChangeProductionAdmissionResult,
} from './change-production-admission.model.ts';

export type ChangeProductionAdmission = (
  command: ChangeProductionAdmissionCommand & Readonly<{ actorId: string }>,
) => Promise<Result<ChangeProductionAdmissionResult, ProductionFeatureFailure>>;

export type LockedProductionAdmission = Readonly<{
  orderId: string;
  locationId: string;
  sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
  productionStatus:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
  productionVersion: number;
  executionStatus: string;
  derivedWeightLbs: number;
  admissionOverride: 'released' | null;
  bagCount: number | null;
  selectedForShift: boolean;
  hasActivePlacement: boolean;
  resolutionState: string;
}>;

export type ChangeProductionAdmissionRepository = UnitOfWork<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockOrder: (
      locationId: string,
      orderId: string,
    ) => Promise<LockedProductionAdmission | null>;
    changeAdmission: (input: {
      locationId: string;
      orderId: string;
      actorId: string;
      expectedVersion: number;
      admissionOverride: 'released' | null;
      nextStatus: 'release_pending' | 'intake_pending' | 'eligible';
      now: Date;
    }) => Promise<ChangeProductionAdmissionResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
