import {
  conflictError,
  invariantViolationError,
  notFoundError,
  validationError,
} from '@pressly/errors';
import type {
  ProductionForecastExpectedLaterItem,
  ProductionForecastInProductionItem,
  ProductionForecastNeedsShiftItem,
  ProductionForecastReadyToPlaceItem,
  ProductionRemainingDayForecast,
} from '@pressly/contracts';
import { result } from '@pressly/kernel';
import { toProductionDatabaseResult } from '../persistence/production-database-result.error.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type { RemainingDayForecastDecision } from '../scheduling/remaining-day-forecast.port.ts';
import type {
  LoadRemainingDayForecast,
  LoadRemainingDayForecastRepository,
  ProjectRemainingDayForecast,
  RemainingDayForecastDemandRow,
} from './load-remaining-day-forecast.port.ts';

const FORECAST_ROW_LIMIT = 500;

type ForecastItem =
  | ProductionForecastInProductionItem
  | ProductionForecastReadyToPlaceItem
  | ProductionForecastExpectedLaterItem
  | ProductionForecastNeedsShiftItem;

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
  switch (row.admissionState) {
    case 'unreleased':
    case 'released':
    case 'withdrawn':
      return row.admissionState;
    default:
      return null;
  }
};

const expectedItem = (
  row: RemainingDayForecastDemandRow,
  readiness: ProductionForecastExpectedLaterItem['readiness'],
): ProductionForecastExpectedLaterItem => {
  const missingEstimate = row.estimatedWeightLbs === null;
  const actionability: ProductionForecastExpectedLaterItem['actionability'] =
    missingEstimate
      ? {
          action: 'monitor',
          state: 'informational',
          reason: 'missing_estimate',
        }
      : readiness === 'awaiting_intake' && row.productionOrderId !== null
        ? {
            action: 'record_intake',
            state: 'available',
            reason: 'physical_intake_required',
          }
        : readiness === 'awaiting_release' && row.productionOrderId !== null
          ? {
              action: 'release_to_production',
              state: 'available',
              reason: 'manual_release_available',
            }
          : {
              action: 'monitor',
              state: 'informational',
              reason: 'awaiting_source_release',
            };

  return {
    ...identity(row, row.estimatedWeightLbs, row.bagCount),
    productionOrderId: row.productionOrderId,
    readiness,
    actionability,
  };
};

const needsShiftActionability = (
  reason: NonNullable<RemainingDayForecastDecision['reason']>,
): ProductionForecastNeedsShiftItem['actionability'] =>
  reason === 'current_run_window_exceeded'
    ? {
        action: 'review_placement',
        state: 'available',
        reason: 'overtime_confirmation_required',
      }
    : {
        action: 'plan_shift',
        state: 'available',
        reason,
      };

const invalidState = (message: string) =>
  result.err(
    invariantViolationError({
      code: 'production_forecast_state_inconsistent',
      message: message,
      safeMessage: message,
    }),
  );

export const makeLoadRemainingDayForecast =
  (deps: {
    repo: LoadRemainingDayForecastRepository;
    clock: ClockPort;
    policy: Pick<
      ProductionPolicyPort,
      | 'resolveProductionOrderExecutionState'
      | 'deriveProductionOrderOperationalStatus'
    >;
    project: ProjectRemainingDayForecast;
  }): LoadRemainingDayForecast =>
  async ({ locationId, serviceDay }) => {
    const loaded = await toProductionDatabaseResult(
      'PRODUCTION_FORECAST_LOAD_FAILED',
      'The remaining-day forecast could not be loaded.',
      () =>
        deps.repo.load({
          locationId,
          serviceDay,
          asOf: deps.clock.now(),
          rowLimit: FORECAST_ROW_LIMIT,
        }),
    );
    if (result.isErr(loaded)) return loaded;
    const readModel = loaded.value;

    if (readModel === null)
      return result.err(
        notFoundError({
          code: 'production_location_not_found',
          message: 'The active production location was not found.',
          safeMessage: 'The active production location was not found.',
        }),
      );
    if (readModel === 'invalid_service_day')
      return result.err(
        validationError({
          code: 'production_forecast_service_day_invalid',
          message: 'The requested service day is invalid for this location.',
          safeMessage:
            'The requested service day is invalid for this location.',
        }),
      );
    if (readModel === 'scope_too_large')
      return result.err(
        conflictError({
          code: 'production_forecast_scope_too_large',
          message:
            'The remaining-day forecast exceeds the supported work limit.',
          safeMessage:
            'The remaining-day forecast exceeds the supported work limit.',
        }),
      );

    const inProduction: ProductionForecastInProductionItem[] = [];
    const expectedLater: ProductionForecastExpectedLaterItem[] = [];
    const readyRows: RemainingDayForecastDemandRow[] = [];

    for (const row of readModel.demandRows) {
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

      const execution = deps.policy.resolveProductionOrderExecutionState({
        executionState: row.executionStatus,
        operationalStatus: row.operationalStatus,
      });
      if (execution.tag === 'err')
        return result.err(
          conflictError({
            code: execution.error.code.toLowerCase(),
            message: execution.error.message,
            safeMessage: execution.error.message,
          }),
        );

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
      if (
        row.admissionOverride !== null &&
        row.admissionOverride !== 'released'
      )
        return invalidState(
          'A production order has an unknown admission override.',
        );

      const operationalStatus =
        deps.policy.deriveProductionOrderOperationalStatus({
          executionState: execution.value,
          admission,
          admissionOverride: row.admissionOverride,
          hasPositiveDemand: row.derivedWeightLbs > 0,
          bagCount: row.bagCount,
        });

      if (operationalStatus === 'eligible') {
        if (row.bagCount === null)
          return invalidState(
            'An eligible production order is missing physical intake.',
          );
        readyRows.push(row);
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

    const projection = deps.project({
      activeRuns: readModel.activeRuns,
      readyOrders: readyRows.map((row) => ({
        id: row.productionOrderId!,
        dueAt: row.dueAt.toISOString(),
        priority: row.priority,
        derivedWeightLbs: row.derivedWeightLbs!,
        bagCount: row.bagCount!,
        version: row.productionOrderVersion!,
      })),
    });
    const readyById = new Map(
      readyRows.map((row) => [row.productionOrderId!, row]),
    );
    const decisionIds = new Set(
      projection.decisions.map((decision) => decision.productionOrderId),
    );
    if (
      decisionIds.size !== projection.decisions.length ||
      decisionIds.size !== readyRows.length ||
      [...decisionIds].some((id) => !readyById.has(id))
    )
      return invalidState(
        'The remaining-day placement projection did not cover ready work exactly once.',
      );

    const readyToPlace: ProductionForecastReadyToPlaceItem[] = [];
    const needsShift: ProductionForecastNeedsShiftItem[] = [];
    const activeRunId =
      readModel.activeRuns.length === 1
        ? readModel.activeRuns[0]!.run.id
        : null;

    for (const decision of projection.decisions) {
      const row = readyById.get(decision.productionOrderId)!;
      if (decision.disposition === 'ready_to_place') {
        if (decision.reason !== null || activeRunId === null)
          return invalidState(
            'Appendable work is missing one exact active-run target.',
          );
        readyToPlace.push({
          ...identity(row, row.derivedWeightLbs, row.bagCount),
          productionOrderId: row.productionOrderId!,
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
        productionOrderId: row.productionOrderId!,
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
    if (readyRows.length > 0 && readModel.activeRuns.length === 0)
      capacityReasons.push('no_active_run');
    if (readyRows.length > 0 && readModel.activeRuns.length > 1)
      capacityReasons.push('ambiguous_active_run');

    const capacityLevel: ProductionRemainingDayForecast['capacityRisk']['level'] =
      readyRows.length > 0 && readModel.activeRuns.length !== 1
        ? 'unknown'
        : needsShift.length > 0 ||
            expectedLater.length > 0 ||
            expectedLaterSummary.missingEstimateOrderCount > 0
          ? 'attention'
          : 'clear';

    return result.ok({
      locationId: readModel.locationId,
      serviceDay: readModel.serviceDay,
      timezone: readModel.timezone,
      window: {
        startsAt: readModel.startsAt.toISOString(),
        endsAt: readModel.endsAt.toISOString(),
      },
      asOf: readModel.asOf.toISOString(),
      assumptions: {
        algorithmVersion: projection.algorithmVersion,
        overdueUnfinishedIncluded: true,
        physicalIntakeRequired: true,
        wholeOrderPlacement: true,
        expectedWeightsAdvisory: true,
        missingEstimatesExcludedFromWeightTotals: true,
        placementRevalidatedOnCommit: true,
        preciseFinishForecasted: false,
      },
      shifts: readModel.shifts.map((shift) => ({
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
          readModel.activeRuns.length === 1
            ? readModel.activeRuns[0]!.run.pulseCapacityLbs
            : null,
      },
      groups: {
        inProduction,
        readyToPlace,
        expectedLater,
        needsShift,
      },
    });
  };

export type {
  LoadRemainingDayForecast,
  LoadRemainingDayForecastRepository,
} from './load-remaining-day-forecast.port.ts';
