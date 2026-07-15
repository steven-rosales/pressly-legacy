import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type OrderDemandState = 'ready_for_production' | 'not_ready';

export type ApplyOrderDemandCommand = Readonly<{
  demandKey: string;
  displayReference: string;
  locationId: string;
  revisionAt: string;
  revisionHash: string;
  state: OrderDemandState;
  dueAt: string;
  estimatedWeightLbs: number;
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
  bagCount: number | null;
  productionStatus: string | null;
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
      productionStatus: 'eligible' | 'intake_pending' | 'ineligible';
      now: Date;
    }) => Promise<StoredOrderDemand>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
