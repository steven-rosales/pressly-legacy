import type {
  ProcessorOperationalOrderIdentity,
  ProcessorRemainingDayForecast,
} from '@pressly/contracts/processor';
import {
  orderDemandReferenceId,
  productionOrderReferenceId,
} from '@pressly/processor-experience';
import type { ProductionRemainingDayForecast } from '@pressly/production';
import { requireOperationalOrderIdentity } from './operational-order-identity.contract.mapper.ts';

export const toProcessorRemainingDayForecastContract = (
  base: ProductionRemainingDayForecast,
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
): ProcessorRemainingDayForecast => {
  const identify = <
    Item extends Readonly<{
      productionOrderId: string | null;
      orderDemandId: string;
      dueAt: Date;
      actionability: Readonly<Record<string, unknown>>;
    }>,
  >(
    item: Item,
  ) => ({
    ...item,
    dueAt: item.dueAt.toISOString(),
    actionability: { ...item.actionability },
    identity: requireOperationalOrderIdentity(
      identities,
      item.productionOrderId === null
        ? orderDemandReferenceId(item.orderDemandId)
        : productionOrderReferenceId(item.productionOrderId),
    ),
  });

  return {
    locationId: base.locationId,
    serviceDay: base.serviceDay,
    timezone: base.timezone,
    window: {
      startsAt: base.window.startsAt.toISOString(),
      endsAt: base.window.endsAt.toISOString(),
    },
    asOf: base.asOf.toISOString(),
    assumptions: { ...base.assumptions },
    shifts: base.shifts.map((shift) => ({
      ...shift,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
    })),
    totals: {
      all: { ...base.totals.all },
      inProduction: { ...base.totals.inProduction },
      readyToPlace: { ...base.totals.readyToPlace },
      expectedLater: { ...base.totals.expectedLater },
      needsShift: { ...base.totals.needsShift },
    },
    capacityRisk: {
      ...base.capacityRisk,
      reasons: [...base.capacityRisk.reasons],
    },
    groups: {
      inProduction: base.groups.inProduction.map(identify),
      readyToPlace: base.groups.readyToPlace.map(identify),
      expectedLater: base.groups.expectedLater.map(identify),
      needsShift: base.groups.needsShift.map(identify),
    },
  };
};
