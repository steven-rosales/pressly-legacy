import type {
  RecordOrderIntakeCommand,
  RecordOrderIntakeResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type RecordOrderIntake = (
  command: RecordOrderIntakeCommand & Readonly<{ actorId: string }>,
) => Promise<Result<RecordOrderIntakeResult, AppError>>;

export type LockedIntakeOrder = Readonly<{
  orderId: string;
  locationId: string;
  productionStatus: string;
  productionVersion: number;
  intakeVersion: number;
  derivedWeightLbs: number;
  demandState: 'ready_for_production' | 'not_ready';
}>;

export type RecordOrderIntakeRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockOrder: (
      locationId: string,
      orderId: string,
    ) => Promise<LockedIntakeOrder | null>;
    recordIntake: (input: {
      locationId: string;
      orderId: string;
      bagCount: number;
      expectedVersion: number;
      currentIntakeVersion: number;
      now: Date;
    }) => Promise<RecordOrderIntakeResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
