import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type FulfillmentAdmissionState = 'unreleased' | 'released' | 'withdrawn';

export type FulfillmentCommercialState = 'open' | 'completed' | 'canceled';

export type ApplyFulfillmentDemandCommand = Readonly<{
  fulfillmentId: string;
  fulfillmentVersion: number;
  projectionHash: string;
  displayReference: string | null;
  locationId: string;
  admissionState: FulfillmentAdmissionState;
  commercialState: FulfillmentCommercialState;
  dueAt: string;
  observedAt: string;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: 'external_estimate' | null;
  bagCount: number | null;
  idempotencyKey: string;
}>;

export type ApplyFulfillmentDemandResult = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  outcome: 'applied' | 'ignored_older' | 'unchanged';
  replayed: boolean;
}>;

export type ApplyFulfillmentDemand = (
  command: ApplyFulfillmentDemandCommand,
) => Promise<Result<ApplyFulfillmentDemandResult, AppError>>;

export type StoredFulfillmentDemand = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  fulfillmentId: string;
  fulfillmentVersion: number;
  projectionHash: string;
  locationId: string;
  admissionState: FulfillmentAdmissionState;
  commercialState: FulfillmentCommercialState;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: 'external_estimate' | null;
  bagCount: number | null;
  admissionOverride: 'released' | null;
  productionStatus:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished'
    | null;
}>;

export type FulfillmentProductionMutation =
  | Readonly<{ action: 'none' }>
  | Readonly<{ action: 'preserve' }>
  | Readonly<{
      action: 'create' | 'update';
      status: 'release_pending' | 'intake_pending' | 'eligible' | 'ineligible';
    }>;

export type ApplyFulfillmentDemandRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    locationIsActive: (locationId: string) => Promise<boolean>;
    lockFulfillment: (fulfillmentId: string) => Promise<void>;
    loadDemand: (
      fulfillmentId: string,
    ) => Promise<StoredFulfillmentDemand | null>;
    applyDemand: (input: {
      command: ApplyFulfillmentDemandCommand;
      orderDemandId: string;
      production: FulfillmentProductionMutation;
      effectiveBagCount: number | null;
      now: Date;
    }) => Promise<StoredFulfillmentDemand>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
