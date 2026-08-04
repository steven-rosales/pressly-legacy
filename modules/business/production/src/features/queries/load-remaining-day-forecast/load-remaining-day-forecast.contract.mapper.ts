export {
  productionRemainingDayForecastParamsSchema,
  productionRemainingDayForecastQuerySchema,
  productionRemainingDayForecastSchema,
} from '@pressly/contracts/production';
import type {
  ProductionRemainingDayForecast as ProductionRemainingDayForecastResult,
  ProductionRemainingDayForecastParams,
  ProductionRemainingDayForecastQuery,
} from '@pressly/contracts/production';
import { utcIsoFromDate } from '@pressly/time';
import type {
  LoadRemainingDayForecastCommand,
  ProductionForecastOrderIdentity,
  ProductionRemainingDayForecast,
} from './load-remaining-day-forecast.model.ts';

export const toLoadRemainingDayForecastCommand = (input: {
  params: ProductionRemainingDayForecastParams;
  query: ProductionRemainingDayForecastQuery;
}): LoadRemainingDayForecastCommand => ({
  locationId: input.params.locationId,
  serviceDay: input.query.serviceDay,
});

const toForecastOrderIdentityResult = (
  item: ProductionForecastOrderIdentity,
) => ({
  orderDemandId: item.orderDemandId,
  externalOrderId: item.externalOrderId,
  dueAt: utcIsoFromDate(item.dueAt),
  priority: item.priority,
  estimatedWeightLbs: item.estimatedWeightLbs,
  bagCount: item.bagCount,
});

export const toProductionRemainingDayForecastResult = (
  forecast: ProductionRemainingDayForecast,
): ProductionRemainingDayForecastResult => ({
  locationId: forecast.locationId,
  serviceDay: forecast.serviceDay,
  timezone: forecast.timezone,
  window: {
    startsAt: utcIsoFromDate(forecast.window.startsAt),
    endsAt: utcIsoFromDate(forecast.window.endsAt),
  },
  asOf: utcIsoFromDate(forecast.asOf),
  assumptions: { ...forecast.assumptions },
  shifts: forecast.shifts.map((shift) => ({
    productionShiftId: shift.productionShiftId,
    startsAt: utcIsoFromDate(shift.startsAt),
    endsAt: utcIsoFromDate(shift.endsAt),
    status: shift.status,
    activeRunId: shift.activeRunId,
  })),
  totals: {
    all: { ...forecast.totals.all },
    inProduction: { ...forecast.totals.inProduction },
    readyToPlace: { ...forecast.totals.readyToPlace },
    expectedLater: { ...forecast.totals.expectedLater },
    needsShift: { ...forecast.totals.needsShift },
  },
  capacityRisk: {
    level: forecast.capacityRisk.level,
    reasons: [...forecast.capacityRisk.reasons],
    pulseCapacityLbs: forecast.capacityRisk.pulseCapacityLbs,
  },
  groups: {
    inProduction: forecast.groups.inProduction.map((item) => ({
      ...toForecastOrderIdentityResult(item),
      productionOrderId: item.productionOrderId,
      activeRunId: item.activeRunId,
      activeBatchId: item.activeBatchId,
      actionability: { ...item.actionability },
    })),
    readyToPlace: forecast.groups.readyToPlace.map((item) => ({
      ...toForecastOrderIdentityResult(item),
      productionOrderId: item.productionOrderId,
      activeRunId: item.activeRunId,
      actionability: { ...item.actionability },
    })),
    expectedLater: forecast.groups.expectedLater.map((item) => ({
      ...toForecastOrderIdentityResult(item),
      productionOrderId: item.productionOrderId,
      readiness: item.readiness,
      actionability: { ...item.actionability },
    })),
    needsShift: forecast.groups.needsShift.map((item) => ({
      ...toForecastOrderIdentityResult(item),
      productionOrderId: item.productionOrderId,
      activeRunId: item.activeRunId,
      reason: item.reason,
      actionability: { ...item.actionability },
    })),
  },
});
