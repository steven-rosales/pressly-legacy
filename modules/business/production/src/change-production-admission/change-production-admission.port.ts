import type {
  ChangeProductionAdmissionCommand,
  ChangeProductionAdmissionResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type ChangeProductionAdmission = (
  command: ChangeProductionAdmissionCommand & Readonly<{ actorId: string }>,
) => Promise<Result<ChangeProductionAdmissionResult, AppError>>;

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
  admissionOverride: 'released' | null;
  bagCount: number | null;
  selectedForShift: boolean;
  hasActivePlacement: boolean;
}>;

export type ChangeProductionAdmissionRepository = Transactional<
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
