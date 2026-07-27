import type { ProductionRemainingDayForecast } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  RemainingDayForecastInput,
  RemainingDayForecastOutput,
} from '../production.port.ts';

export type RemainingDayForecastDemandRow = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  displayReference: string;
  admissionState: string;
  phase: string;
  dueAt: Date;
  estimatedWeightLbs: number | null;
  priority: boolean;
  operationalStatus: string | null;
  executionStatus: string | null;
  admissionOverride: string | null;
  derivedWeightLbs: number | null;
  bagCount: number | null;
  productionOrderVersion: number | null;
  activePlacement: Readonly<{
    productionRunId: string;
    productionBatchId: string;
  }> | null;
}>;

export type RemainingDayForecastReadModel = Readonly<{
  locationId: string;
  timezone: string;
  serviceDay: string;
  startsAt: Date;
  endsAt: Date;
  asOf: Date;
  demandRows: readonly RemainingDayForecastDemandRow[];
  shifts: readonly Readonly<{
    productionShiftId: string;
    startsAt: Date;
    endsAt: Date;
    status: 'draft' | 'open' | 'closed';
    activeRunId: string | null;
  }>[];
  activeRuns: RemainingDayForecastInput['activeRuns'];
}>;

export type LoadRemainingDayForecast = (query: {
  locationId: string;
  serviceDay: string;
}) => Promise<Result<ProductionRemainingDayForecast, AppError>>;

export type LoadRemainingDayForecastRepository = Readonly<{
  load: (input: {
    locationId: string;
    serviceDay: string;
    asOf: Date;
    rowLimit: number;
  }) => Promise<
    | RemainingDayForecastReadModel
    | 'scope_too_large'
    | 'invalid_service_day'
    | null
  >;
}>;

export type ProjectRemainingDayForecast = (
  input: RemainingDayForecastInput,
) => RemainingDayForecastOutput;
