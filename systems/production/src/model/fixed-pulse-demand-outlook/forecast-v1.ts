import {
  addMinutes,
  fixedPulseMakespanMinutes,
  packFixedPulseItems,
  pulseCapacity,
  sortFixedPulseItems,
} from '../fixed-pulse-planning/plan.ts';
import type { ForecastFixedPulseDemandOutlook } from './model.ts';

export const forecastFixedPulseDemandOutlookV1: ForecastFixedPulseDemandOutlook =
  (input) => {
    const capacity = pulseCapacity({
      machines: input.machines,
      foldLbsPerFolderMinute: input.config.foldLbsPerFolderMinute,
      effectiveFolderCount: input.shift.effectiveFolderCount,
      pulseMinutes: input.config.pulseMinutes,
    });
    const candidates = sortFixedPulseItems(
      input.demand.map((demand) => ({
        id: demand.id,
        dueAt: demand.dueAt,
        priority: demand.priority,
        weightLbs: demand.estimatedWeightLbs,
        value: demand,
      })),
      input.shift,
    );
    const placeable = candidates.filter(
      (demand) =>
        capacity.pulseCapacityLbs > 0 &&
        demand.weightLbs <= capacity.pulseCapacityLbs,
    );
    const unplacedDemandIds = candidates
      .filter((demand) => !placeable.includes(demand))
      .map((demand) => demand.id)
      .sort();
    const batches = packFixedPulseItems(
      placeable,
      capacity.pulseCapacityLbs,
    ).map((batch, sequence) => ({
      sequence,
      demandIds: batch.items.map((demand) => demand.id),
      estimatedWeightLbs: batch.weightLbs,
      expectedOrderCount: batch.items.filter(
        (demand) => demand.value.disposition === 'expected',
      ).length,
      readyOrderCount: batch.items.filter(
        (demand) => demand.value.disposition === 'ready',
      ).length,
    }));
    const makespanMinutes = fixedPulseMakespanMinutes(
      batches.length,
      input.config.pulseMinutes,
    );

    return {
      algorithmVersion: 'fixed-pulse-demand-outlook-v1',
      startsAt: input.shift.startsAt,
      completesAt: addMinutes(input.shift.startsAt, makespanMinutes),
      pulseMinutes: input.config.pulseMinutes,
      pulseCapacityLbs: capacity.pulseCapacityLbs,
      batchCount: batches.length,
      makespanMinutes,
      batches,
      unplacedDemandIds,
    };
  };
