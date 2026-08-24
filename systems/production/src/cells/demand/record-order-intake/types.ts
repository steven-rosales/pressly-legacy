import type {
  OrderDemandPhase,
  ProductionRules,
} from '../../../model/public.ts';

export type RecordOrderIntakeCommand = Readonly<{
  locationId: string;
  productionOrderId: string;
  actorId: string;
  bagCount: number;
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type RecordOrderIntakeResult = Readonly<{
  locationId: string;
  orderId: string;
  bagCount: number;
  bagCountProvenance: 'operator_intake';
  intakeVersion: number;
  version: number;
  replayed: boolean;
}>;

export type RecordOrderIntakeExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type RecordOrderIntakeFacts = Readonly<{
  productionOrderId: string;
  productionStatus: string;
  productionVersion: number;
  intakeVersion: number;
  derivedWeightLbs: number;
  demandPhase: OrderDemandPhase;
  admissionOverride: 'released' | null;
  executionStatus: string;
  resolutionState: string;
}>;

export type RecordOrderIntakePolicy = Pick<
  ProductionRules,
  | 'evaluateProductionOrderOperationalAccess'
  | 'evaluateIntakeAdmission'
  | 'resolveProductionOrderExecutionState'
  | 'deriveProductionOrderOperationalStatus'
>;

export type RecordOrderIntakeDecision =
  | Readonly<{
      kind: 'commit';
      nextStatus: 'release_pending' | 'eligible';
    }>
  | Readonly<{
      kind: 'reject';
      failure: RecordOrderIntakeExpectedFailure;
    }>;
