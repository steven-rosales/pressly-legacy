import {
  configError,
  invariantViolationError,
} from '@pressly/errors/factories';
import {
  calendarDayRangeAt,
  instantFromDate,
  utcIsoFromDate,
} from '@pressly/time';
import type { DemandForecastOutput } from '../../../foundations/language/scheduling/production-scheduling.model.ts';
import type { OrderDemandPhase } from '../../../foundations/language/execution/order-demand.model.ts';
import type { ProductionAlgorithmRegistry } from '../../../foundations/algorithms/approved-production/production-algorithm-registry.factory.ts';
import type { SchedulerConfig } from '../../../foundations/language/scheduling/scheduler-config.model.ts';
import type {
  ProductionDemandOutlook,
  ProductionDemandOutlookItem,
  ProductionWorkspaceMachine,
  ProductionWorkspaceShift,
} from './load-production-workspace.model.ts';
import type { DemandOutlookRow } from './load-production-workspace.port.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const productionConfigError = (code: string, message: string) =>
  configError({
    code,
    message,
    safeMessage: 'Production configuration is invalid.',
  });

const mapPhase = (value: string): OrderDemandPhase => {
  switch (value) {
    case 'expected':
    case 'inbound':
    case 'production_released':
    case 'post_production':
    case 'withdrawn':
      return value;
    default:
      throw productionInvariantViolation(
        'production_demand_outlook_phase_invalid',
        `Unknown order-demand phase: ${value}.`,
      );
  }
};

const mapProductionStatus = (
  value: string | null,
): ProductionDemandOutlookItem['productionStatus'] => {
  switch (value) {
    case null:
    case 'release_pending':
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return value;
    default:
      throw productionInvariantViolation(
        'production_demand_outlook_order_status_invalid',
        `Unknown production-order status: ${value}.`,
      );
  }
};

const readiness = (
  status: ProductionDemandOutlookItem['productionStatus'],
): ProductionDemandOutlookItem['readiness'] => {
  switch (status) {
    case 'release_pending':
      return 'awaiting_release';
    case 'intake_pending':
      return 'awaiting_intake';
    case 'eligible':
      return 'ready';
    case 'scheduled':
      return 'in_production';
    case 'finished':
      return 'finished';
    case 'ineligible':
    case null:
      return 'not_admitted';
  }
};

const isActivePhase = (phase: OrderDemandPhase): boolean =>
  phase === 'expected' ||
  phase === 'inbound' ||
  phase === 'production_released';

const nextServiceDayCutoff = (shift: ProductionWorkspaceShift): Date => {
  const serviceDay = calendarDayRangeAt(
    shift.timezone,
    instantFromDate(shift.endsAt),
  );
  if (serviceDay.tag === 'err')
    throw productionConfigError(
      'production_demand_outlook_service_day_invalid',
      'The production service-day cutoff is invalid.',
    );
  return new Date(serviceDay.value.endsAt);
};

const sumKnownWeight = (
  items: readonly ProductionDemandOutlookItem[],
): number =>
  items.reduce((total, item) => total + (item.estimatedWeightLbs ?? 0), 0);

const mapDemandForecast = (
  forecast: DemandForecastOutput,
): NonNullable<ProductionDemandOutlook['forecast']> => ({
  ...forecast,
  batches: forecast.batches.map((batch) => ({
    ...batch,
    demandIds: [...batch.demandIds],
  })),
  unplacedDemandIds: [...forecast.unplacedDemandIds],
});

export const projectDemandOutlook = (input: {
  shift: ProductionWorkspaceShift;
  config: SchedulerConfig | null;
  machines: readonly ProductionWorkspaceMachine[];
  activeRunExists: boolean;
  rows: readonly DemandOutlookRow[];
  scheduler: Pick<ProductionAlgorithmRegistry, 'forecastDemand'>;
}): ProductionDemandOutlook => {
  const horizonCutoffAt = nextServiceDayCutoff(input.shift);
  const horizon = horizonCutoffAt.getTime();
  const items = input.rows
    .filter((row) => row.dueAt.getTime() < horizon)
    .flatMap((row): ProductionDemandOutlookItem[] => {
      const phase = mapPhase(row.phase);
      const productionStatus = mapProductionStatus(row.productionStatus);
      if (
        productionStatus !== 'scheduled' &&
        (!isActivePhase(phase) || productionStatus === 'finished')
      )
        return [];
      return [
        {
          orderDemandId: row.orderDemandId,
          productionOrderId: row.productionOrderId,
          externalOrderId: row.externalOrderId,
          phase,
          dueAt: row.dueAt,
          estimatedWeightLbs: row.estimatedWeightLbs,
          readiness: readiness(productionStatus),
          productionStatus,
          bagCount: row.bagCount,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.dueAt.getTime() - right.dueAt.getTime() ||
        left.externalOrderId.localeCompare(right.externalOrderId),
    );
  const expectedItems = items.filter(
    (item) =>
      isActivePhase(item.phase) &&
      (item.readiness === 'awaiting_intake' ||
        item.readiness === 'awaiting_release' ||
        item.readiness === 'not_admitted'),
  );
  const readyItems = items.filter((item) => item.readiness === 'ready');
  const inProductionItems = items.filter(
    (item) => item.readiness === 'in_production',
  );
  const forwardDemandItems = items.filter(
    (item) => item.readiness !== 'finished',
  );
  const forecastDemand = items.flatMap((item) => {
    if (!isActivePhase(item.phase) || item.estimatedWeightLbs === null)
      return [];
    if (
      item.readiness !== 'ready' &&
      item.readiness !== 'awaiting_intake' &&
      item.readiness !== 'awaiting_release'
    )
      return [];
    return [
      {
        id: item.orderDemandId,
        dueAt: utcIsoFromDate(item.dueAt),
        priority:
          input.rows.find(
            (candidate) => candidate.orderDemandId === item.orderDemandId,
          )?.priority ?? false,
        estimatedWeightLbs: item.estimatedWeightLbs,
        disposition:
          item.readiness === 'ready'
            ? ('ready' as const)
            : ('expected' as const),
      },
    ];
  });
  const forecast =
    input.activeRunExists || input.config === null
      ? null
      : mapDemandForecast(
          input.scheduler.forecastDemand({
            demand: forecastDemand,
            machines: input.machines,
            shift: {
              startsAt: utcIsoFromDate(input.shift.startsAt),
              timezone: input.shift.timezone,
              effectiveFolderCount: input.shift.effectiveFolderCount,
            },
            config: input.config,
          }),
        );

  return {
    productionShiftId: input.shift.id,
    horizonCutoffAt,
    totalOrderCount: forwardDemandItems.length,
    totalEstimatedWeightLbs: sumKnownWeight(forwardDemandItems),
    estimateMissingOrderCount: forwardDemandItems.filter(
      (item) => item.estimatedWeightLbs === null,
    ).length,
    expectedOrderCount: expectedItems.length,
    expectedEstimatedWeightLbs: sumKnownWeight(expectedItems),
    readyOrderCount: readyItems.length,
    readyEstimatedWeightLbs: sumKnownWeight(readyItems),
    inProductionOrderCount: inProductionItems.length,
    inProductionEstimatedWeightLbs: sumKnownWeight(inProductionItems),
    items,
    forecast,
  };
};
