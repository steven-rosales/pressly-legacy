import {
  configError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type {
  DemandForecastOutput,
  DemandOutlook,
  DemandOutlookItem,
  DemandOutlookRow,
  WorkspaceMachine,
  WorkspaceScheduler,
  WorkspaceSchedulerConfig,
  WorkspaceShift,
} from './types.ts';

const productionInvariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const productionConfig = (code: string, message: string) =>
  configError({
    code,
    message,
    safeMessage: 'Production configuration is invalid.',
  });

type CalendarDate = Readonly<{ year: number; month: number; day: number }>;
type WallDateTime = CalendarDate &
  Readonly<{
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
  }>;

const wallToUtcMs = (wall: WallDateTime): number =>
  Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  );

const wallFromInstant = (timezone: string, instant: number): WallDateTime => {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
    millisecond: read('fractionalSecond'),
  };
};

const sameWall = (left: WallDateTime, right: WallDateTime): boolean =>
  left.year === right.year &&
  left.month === right.month &&
  left.day === right.day &&
  left.hour === right.hour &&
  left.minute === right.minute &&
  left.second === right.second &&
  left.millisecond === right.millisecond;

const addCalendarDays = (date: CalendarDate, days: number): CalendarDate => {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
};

const startOfCalendarDate = (
  timezone: string,
  date: CalendarDate,
): Date | null => {
  const wall: WallDateTime = {
    ...date,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
  const naiveUtcMs = wallToUtcMs(wall);
  const offsets = [
    ...new Set(
      Array.from({ length: 13 }, (_, index) => {
        const sampled = naiveUtcMs + (-36 + index * 6) * 60 * 60_000;
        return wallToUtcMs(wallFromInstant(timezone, sampled)) - sampled;
      }),
    ),
  ];
  const candidates = offsets
    .map((offset) => naiveUtcMs - offset)
    .filter((instant) => sameWall(wallFromInstant(timezone, instant), wall))
    .sort((left, right) => left - right);
  const first = candidates[0];
  return first === undefined ? null : new Date(first);
};

const nextServiceDayCutoff = (shift: WorkspaceShift): Date => {
  const wall = wallFromInstant(shift.timezone, shift.endsAt.getTime());
  const cutoff = startOfCalendarDate(
    shift.timezone,
    addCalendarDays({ year: wall.year, month: wall.month, day: wall.day }, 1),
  );
  if (cutoff === null)
    throw productionConfig(
      'production_demand_outlook_service_day_invalid',
      'The production service-day cutoff is invalid.',
    );
  return cutoff;
};

const mapPhase = (value: string): DemandOutlookItem['phase'] => {
  switch (value) {
    case 'expected':
    case 'inbound':
    case 'production_released':
    case 'post_production':
    case 'withdrawn':
      return value;
    default:
      throw productionInvariant(
        'production_demand_outlook_phase_invalid',
        `Unknown order-demand phase: ${value}.`,
      );
  }
};

const mapProductionStatus = (
  value: string | null,
): DemandOutlookItem['productionStatus'] => {
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
      throw productionInvariant(
        'production_demand_outlook_order_status_invalid',
        `Unknown production-order status: ${value}.`,
      );
  }
};

const readiness = (
  status: DemandOutlookItem['productionStatus'],
): DemandOutlookItem['readiness'] => {
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

const isActivePhase = (phase: DemandOutlookItem['phase']): boolean =>
  phase === 'expected' ||
  phase === 'inbound' ||
  phase === 'production_released';

const sumKnownWeight = (items: readonly DemandOutlookItem[]): number =>
  items.reduce((total, item) => total + (item.estimatedWeightLbs ?? 0), 0);

const copyForecast = (
  forecast: DemandForecastOutput,
): DemandForecastOutput => ({
  ...forecast,
  batches: forecast.batches.map((batch) => ({
    ...batch,
    demandIds: [...batch.demandIds],
  })),
  unplacedDemandIds: [...forecast.unplacedDemandIds],
});

export const projectDemandOutlook = (input: {
  shift: WorkspaceShift;
  config: WorkspaceSchedulerConfig | null;
  machines: readonly WorkspaceMachine[];
  activeRunExists: boolean;
  rows: readonly DemandOutlookRow[];
  scheduler: Pick<WorkspaceScheduler, 'forecastDemand'>;
}): DemandOutlook => {
  const horizonCutoffAt = nextServiceDayCutoff(input.shift);
  const horizon = horizonCutoffAt.getTime();
  const items = input.rows
    .filter((row) => row.dueAt.getTime() < horizon)
    .flatMap((row): DemandOutlookItem[] => {
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
        dueAt: item.dueAt.toISOString(),
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
      : copyForecast(
          input.scheduler.forecastDemand({
            demand: forecastDemand,
            machines: input.machines,
            shift: {
              startsAt: input.shift.startsAt.toISOString(),
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
