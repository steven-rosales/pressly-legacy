import type { ProductionRemainingDayForecast } from './boundary.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import { loadRemainingDayForecastExecutionInvalid } from './failures.ts';
import { projectRemainingDayPlacements } from './placement.ts';
import type {
  LoadRemainingDayForecastExecutionInvalid,
  RemainingDayForecastDemandRow,
  RemainingDayForecastPolicy,
  RemainingDayForecastReadModel,
  RemainingDayForecastReason,
  RemainingDayForecastScheduler,
} from './types.ts';

type ForecastItem =
  | ProductionRemainingDayForecast['groups']['inProduction'][number]
  | ProductionRemainingDayForecast['groups']['readyToPlace'][number]
  | ProductionRemainingDayForecast['groups']['expectedLater'][number]
  | ProductionRemainingDayForecast['groups']['needsShift'][number];
type ReadyRow = RemainingDayForecastDemandRow &
  Readonly<{
    productionOrderId: string;
    operationalStatus: string;
    derivedWeightLbs: number;
    bagCount: number;
    productionOrderVersion: number;
  }>;

export type ProjectRemainingDayForecastResult =
  | Readonly<{ kind: 'success'; value: ProductionRemainingDayForecast }>
  | Readonly<{
      kind: 'failure';
      failure: LoadRemainingDayForecastExecutionInvalid;
    }>;

const identity = (
  row: RemainingDayForecastDemandRow,
  estimatedWeightLbs: number | null,
  bagCount: number | null,
) => ({
  orderDemandId: row.orderDemandId,
  externalOrderId: row.displayReference,
  dueAt: row.dueAt.toISOString(),
  priority: row.priority,
  estimatedWeightLbs,
  bagCount,
});

const summarize = (
  items: readonly ForecastItem[],
): ProductionRemainingDayForecast['totals']['all'] => {
  const knownWeightMilliLbs = items.reduce(
    (total, item) =>
      total +
      (item.estimatedWeightLbs === null
        ? 0
        : Math.round(item.estimatedWeightLbs * 1_000)),
    0,
  );
  return {
    orderCount: items.length,
    knownWeightLbs: knownWeightMilliLbs / 1_000,
    missingEstimateOrderCount: items.filter(
      (item) => item.estimatedWeightLbs === null,
    ).length,
  };
};

const admissionFor = (
  row: RemainingDayForecastDemandRow,
): 'unreleased' | 'released' | 'withdrawn' | 'post_production' | null => {
  if (row.phase === 'post_production') return 'post_production';
  if (
    row.admissionState === 'unreleased' ||
    row.admissionState === 'released' ||
    row.admissionState === 'withdrawn'
  )
    return row.admissionState;
  return null;
};

const expectedItem = (
  row: RemainingDayForecastDemandRow,
  readiness: ProductionRemainingDayForecast['groups']['expectedLater'][number]['readiness'],
): ProductionRemainingDayForecast['groups']['expectedLater'][number] => {
  const missingEstimate = row.estimatedWeightLbs === null;
  const actionability = missingEstimate
    ? ({
        action: 'monitor',
        state: 'informational',
        reason: 'missing_estimate',
      } as const)
    : readiness === 'awaiting_intake' && row.productionOrderId !== null
      ? ({
          action: 'record_intake',
          state: 'available',
          reason: 'physical_intake_required',
        } as const)
      : readiness === 'awaiting_release' && row.productionOrderId !== null
        ? ({
            action: 'release_to_production',
            state: 'available',
            reason: 'manual_release_available',
          } as const)
        : ({
            action: 'monitor',
            state: 'informational',
            reason: 'awaiting_source_release',
          } as const);
  return {
    ...identity(row, row.estimatedWeightLbs, row.bagCount),
    productionOrderId: row.productionOrderId,
    readiness,
    actionability,
  };
};

const needsShiftActionability = (reason: RemainingDayForecastReason) =>
  reason === 'current_run_window_exceeded'
    ? ({
        action: 'review_placement',
        state: 'available',
        reason: 'overtime_confirmation_required',
      } as const)
    : ({
        action: 'plan_shift',
        state: 'available',
        reason,
      } as const);

const invalidState = (message: string): never => {
  throw invariantViolationError({
    code: 'production_forecast_state_inconsistent',
    message,
    safeMessage: message,
  });
};

const readyRow = (row: RemainingDayForecastDemandRow): ReadyRow | null =>
  row.productionOrderId !== null &&
  row.operationalStatus !== null &&
  row.derivedWeightLbs !== null &&
  row.bagCount !== null &&
  row.productionOrderVersion !== null
    ? {
        ...row,
        productionOrderId: row.productionOrderId,
        operationalStatus: row.operationalStatus,
        derivedWeightLbs: row.derivedWeightLbs,
        bagCount: row.bagCount,
        productionOrderVersion: row.productionOrderVersion,
      }
    : null;

export const projectRemainingDayForecast = (input: {
  readModel: RemainingDayForecastReadModel;
  asOf: Date;
  policy: RemainingDayForecastPolicy;
  scheduler: RemainingDayForecastScheduler;
}): ProjectRemainingDayForecastResult => {
  const inProduction: ProductionRemainingDayForecast['groups']['inProduction'] =
    [];
  const expectedLater: ProductionRemainingDayForecast['groups']['expectedLater'] =
    [];
  const readyRows: ReadyRow[] = [];

  for (const row of input.readModel.demandRows) {
    if (row.productionOrderId === null) {
      expectedLater.push(
        expectedItem(
          row,
          row.estimatedWeightLbs === null
            ? 'not_admitted'
            : row.phase === 'production_released'
              ? 'awaiting_intake'
              : 'awaiting_release',
        ),
      );
      continue;
    }
    if (
      row.operationalStatus === null ||
      row.derivedWeightLbs === null ||
      row.productionOrderVersion === null
    )
      return invalidState(
        'A production order is missing required forecast state.',
      );

    const execution = input.policy.resolveProductionOrderExecutionState({
      executionState: row.executionStatus,
      operationalStatus: row.operationalStatus,
    });
    if (execution.tag === 'err')
      return {
        kind: 'failure',
        failure: loadRemainingDayForecastExecutionInvalid(
          execution.error.message,
        ),
      };
    if (execution.value === 'finished') continue;

    if (row.activePlacement !== null) {
      if (execution.value !== 'scheduled')
        return invalidState(
          'An active production placement disagrees with order execution state.',
        );
      if (row.bagCount === null)
        return invalidState(
          'An active production order is missing physical intake.',
        );
      inProduction.push({
        ...identity(row, row.derivedWeightLbs, row.bagCount),
        productionOrderId: row.productionOrderId,
        activeRunId: row.activePlacement.productionRunId,
        activeBatchId: row.activePlacement.productionBatchId,
        actionability: {
          action: 'open_production',
          state: 'available',
          reason: 'already_in_production',
        },
      });
      continue;
    }
    if (execution.value === 'scheduled')
      return invalidState(
        'A scheduled production order has no active batch placement.',
      );

    const admission = admissionFor(row);
    if (admission === null)
      return invalidState(
        'A production order has an unknown demand admission state.',
      );
    if (row.admissionOverride !== null && row.admissionOverride !== 'released')
      return invalidState(
        'A production order has an unknown admission override.',
      );
    const operationalStatus =
      input.policy.deriveProductionOrderOperationalStatus({
        executionState: execution.value,
        admission,
        admissionOverride: row.admissionOverride,
        hasPositiveDemand: row.derivedWeightLbs > 0,
        bagCount: row.bagCount,
      });
    if (operationalStatus === 'eligible') {
      const eligible = readyRow(row);
      if (eligible === null)
        return invalidState(
          'An eligible production order is missing physical intake.',
        );
      readyRows.push(eligible);
      continue;
    }
    if (operationalStatus === 'release_pending') {
      expectedLater.push(expectedItem(row, 'awaiting_release'));
      continue;
    }
    if (operationalStatus === 'intake_pending') {
      expectedLater.push(expectedItem(row, 'awaiting_intake'));
      continue;
    }
    if (operationalStatus === 'ineligible') {
      expectedLater.push(expectedItem(row, 'not_admitted'));
      continue;
    }
    return invalidState(
      'An unassigned production order resolved to an executable state.',
    );
  }

  const placement = projectRemainingDayPlacements({
    activeRuns: input.readModel.activeRuns,
    readyOrders: readyRows.map((row) => ({
      id: row.productionOrderId,
      dueAt: row.dueAt.toISOString(),
      priority: row.priority,
      derivedWeightLbs: row.derivedWeightLbs,
      bagCount: row.bagCount,
      version: row.productionOrderVersion,
    })),
    scheduler: input.scheduler,
  });
  const readyById = new Map(
    readyRows.map((row) => [row.productionOrderId, row]),
  );
  const decisionIds = new Set(
    placement.decisions.map((decision) => decision.productionOrderId),
  );
  if (
    decisionIds.size !== placement.decisions.length ||
    decisionIds.size !== readyRows.length ||
    [...decisionIds].some((id) => !readyById.has(id))
  )
    return invalidState(
      'The remaining-day placement projection did not cover ready work exactly once.',
    );

  const readyToPlace: ProductionRemainingDayForecast['groups']['readyToPlace'] =
    [];
  const needsShift: ProductionRemainingDayForecast['groups']['needsShift'] = [];
  const onlyActiveRun =
    input.readModel.activeRuns.length === 1
      ? input.readModel.activeRuns[0]
      : undefined;
  const activeRunId = onlyActiveRun?.run.id ?? null;
  for (const decision of placement.decisions) {
    const row = readyById.get(decision.productionOrderId);
    if (row === undefined)
      return invalidState('The placement projection returned unknown work.');
    if (decision.disposition === 'ready_to_place') {
      if (decision.reason !== null || activeRunId === null)
        return invalidState(
          'Appendable work is missing one exact active-run target.',
        );
      readyToPlace.push({
        ...identity(row, row.derivedWeightLbs, row.bagCount),
        productionOrderId: row.productionOrderId,
        activeRunId,
        actionability: {
          action: 'place_in_active_run',
          state: 'available',
          reason: 'ready_for_placement',
        },
      });
      continue;
    }
    if (decision.reason === null)
      return invalidState('Work requiring a shift is missing its reason.');
    needsShift.push({
      ...identity(row, row.derivedWeightLbs, row.bagCount),
      productionOrderId: row.productionOrderId,
      activeRunId,
      reason: decision.reason,
      actionability: needsShiftActionability(decision.reason),
    });
  }

  const inProductionSummary = summarize(inProduction);
  const readyToPlaceSummary = summarize(readyToPlace);
  const expectedLaterSummary = summarize(expectedLater);
  const needsShiftSummary = summarize(needsShift);
  const allItems = [
    ...inProduction,
    ...readyToPlace,
    ...expectedLater,
    ...needsShift,
  ];
  const capacityReasons: ProductionRemainingDayForecast['capacityRisk']['reasons'] =
    [];
  if (readyRows.length === 0) capacityReasons.push('no_ready_work');
  if (readyRows.length > 0 && readyToPlace.length === readyRows.length)
    capacityReasons.push('all_ready_work_appendable');
  if (needsShift.length > 0) capacityReasons.push('needs_shift');
  if (expectedLater.length > 0) capacityReasons.push('expected_later');
  if (expectedLaterSummary.missingEstimateOrderCount > 0)
    capacityReasons.push('missing_estimates');
  if (readyRows.length > 0 && input.readModel.activeRuns.length === 0)
    capacityReasons.push('no_active_run');
  if (readyRows.length > 0 && input.readModel.activeRuns.length > 1)
    capacityReasons.push('ambiguous_active_run');
  const capacityLevel =
    readyRows.length > 0 && input.readModel.activeRuns.length !== 1
      ? ('unknown' as const)
      : needsShift.length > 0 ||
          expectedLater.length > 0 ||
          expectedLaterSummary.missingEstimateOrderCount > 0
        ? ('attention' as const)
        : ('clear' as const);

  return {
    kind: 'success',
    value: {
      locationId: input.readModel.locationId,
      serviceDay: input.readModel.serviceDay,
      timezone: input.readModel.timezone,
      window: {
        startsAt: input.readModel.startsAt.toISOString(),
        endsAt: input.readModel.endsAt.toISOString(),
      },
      asOf: input.asOf.toISOString(),
      assumptions: {
        algorithmVersion: placement.algorithmVersion,
        overdueUnfinishedIncluded: true,
        physicalIntakeRequired: true,
        wholeOrderPlacement: true,
        expectedWeightsAdvisory: true,
        missingEstimatesExcludedFromWeightTotals: true,
        placementRevalidatedOnCommit: true,
        preciseFinishForecasted: false,
      },
      shifts: input.readModel.shifts.map((shift) => ({
        productionShiftId: shift.productionShiftId,
        startsAt: shift.startsAt.toISOString(),
        endsAt: shift.endsAt.toISOString(),
        status: shift.status,
        activeRunId: shift.activeRunId,
      })),
      totals: {
        all: summarize(allItems),
        inProduction: inProductionSummary,
        readyToPlace: readyToPlaceSummary,
        expectedLater: expectedLaterSummary,
        needsShift: needsShiftSummary,
      },
      capacityRisk: {
        level: capacityLevel,
        reasons: capacityReasons,
        pulseCapacityLbs:
          input.readModel.activeRuns.length === 1
            ? (input.readModel.activeRuns[0]?.run.pulseCapacityLbs ?? null)
            : null,
      },
      groups: { inProduction, readyToPlace, expectedLater, needsShift },
    },
  };
};
