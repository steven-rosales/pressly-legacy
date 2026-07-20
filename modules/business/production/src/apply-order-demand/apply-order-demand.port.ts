import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  OrderDemandPhase,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type ApplyOrderDemandCommand = Readonly<{
  demandKey: string;
  displayReference: string;
  locationId: string;
  revisionAt: string;
  revisionHash: string;
  phase: OrderDemandPhase;
  sourceStatusCode: string;
  dueAt: string;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: 'external_estimate' | null;
  bagCount: number | null;
  idempotencyKey: string;
}>;

export type ApplyOrderDemandResult = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  outcome: 'applied' | 'ignored_older' | 'unchanged';
  replayed: boolean;
}>;

export type ApplyOrderDemand = (
  command: ApplyOrderDemandCommand,
) => Promise<Result<ApplyOrderDemandResult, AppError>>;

export type StoredOrderDemand = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  locationId: string;
  revisionAt: string;
  revisionHash: string;
  phase: OrderDemandPhase;
  sourceStatusCode: string;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: 'external_estimate' | null;
  bagCount: number | null;
  productionStatus:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished'
    | null;
}>;

export type DemandProductionMutation =
  | Readonly<{ action: 'none' }>
  | Readonly<{ action: 'preserve' }>
  | Readonly<{
      action: 'create' | 'update';
      status: 'release_pending' | 'intake_pending' | 'eligible' | 'ineligible';
    }>;

export type ApplyOrderDemandRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    locationIsActive: (locationId: string) => Promise<boolean>;
    lockDemand: (demandKey: string) => Promise<void>;
    loadDemand: (demandKey: string) => Promise<StoredOrderDemand | null>;
    applyDemand: (input: {
      command: ApplyOrderDemandCommand;
      orderDemandId: string;
      production: DemandProductionMutation;
      effectiveBagCount: number | null;
      now: Date;
    }) => Promise<StoredOrderDemand>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
