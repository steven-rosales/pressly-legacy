import type {
  ProductionDemandOutlook,
  ProductionDemandOutlookItem,
  ProductionMachine,
  ProductionShift,
  SchedulerConfig,
} from '@pressly/contracts';
import { configError, invariantViolationError } from '@pressly/errors';
import { calendarDayRangeAt, instantFromDate, toUtcIso } from '@pressly/time';
import type { DemandForecastOutput } from '../scheduling/production-scheduling.port.ts';
import type { OrderDemandPhase } from '../production-lifecycle/order-demand.model.ts';
import type { ProductionSchedulerPort } from '../scheduling/production-scheduler.port.ts';
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

const nextServiceDayCutoff = (shift: ProductionShift): string => {
  const end = new Date(shift.endsAt);
  const serviceDay = calendarDayRangeAt(shift.timezone, instantFromDate(end));
  if (serviceDay.tag === 'err')
    throw productionConfigError(
      'production_demand_outlook_service_day_invalid',
      'The production service-day cutoff is invalid.',
    );
  return toUtcIso(serviceDay.value.endsAt);
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
  shift: ProductionShift;
  config: SchedulerConfig | null;
  machines: readonly ProductionMachine[];
  activeRunExists: boolean;
  rows: readonly DemandOutlookRow[];
  scheduler: Pick<ProductionSchedulerPort, 'forecastDemand'>;
}): ProductionDemandOutlook => {
  const horizonCutoffAt = nextServiceDayCutoff(input.shift);
  const horizon = Date.parse(horizonCutoffAt);
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
          dueAt: row.dueAt.toISOString(),
          estimatedWeightLbs: row.estimatedWeightLbs,
          readiness: readiness(productionStatus),
          productionStatus,
          bagCount: row.bagCount,
        },
      ];
    })
    .sort(
      (left, right) =>
        Date.parse(left.dueAt) - Date.parse(right.dueAt) ||
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
        dueAt: item.dueAt,
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
            shift: input.shift,
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
