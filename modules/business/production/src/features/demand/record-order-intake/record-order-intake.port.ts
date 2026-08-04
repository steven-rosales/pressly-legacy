import type { RecordOrderIntakeFailure } from './record-order-intake.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { OrderDemandPhase } from '../../../foundations/language/execution/order-demand.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  RecordOrderIntakeCommand,
  RecordOrderIntakeResult,
} from './record-order-intake.model.ts';

export type RecordOrderIntake = (
  command: RecordOrderIntakeCommand & Readonly<{ actorId: string }>,
) => Promise<Result<RecordOrderIntakeResult, RecordOrderIntakeFailure>>;

export type LockedIntakeOrder = Readonly<{
  orderId: string;
  locationId: string;
  productionStatus: string;
  productionVersion: number;
  intakeVersion: number;
  derivedWeightLbs: number;
  demandPhase: OrderDemandPhase;
  admissionOverride: 'released' | null;
  executionStatus: string;
  resolutionState: string;
}>;

export type RecordOrderIntakeRepository = UnitOfWork<
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
      nextStatus: 'release_pending' | 'eligible';
      now: Date;
    }) => Promise<RecordOrderIntakeResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
