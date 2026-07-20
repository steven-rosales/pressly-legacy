import type { ProductionOrderSummary } from '@pressly/contracts';
import {
  calendarDateAt,
  calendarDayDistance,
  calendarDayRangeAt,
  instantFromDate,
  type CalendarDayRange,
} from '@pressly/time';

type ProductionDueBucket = ProductionOrderSummary['dueBucket'];

export type ProductionDueFilter = Readonly<{
  dueAtOrAfter: Date | null;
  dueBefore: Date | null;
}>;

const requireDayRange = (
  now: Date,
  timezone: string,
  dayOffset: number,
): CalendarDayRange => {
  const range = calendarDayRangeAt(timezone, instantFromDate(now), dayOffset);
  if (range.tag === 'err')
    throw new Error(`Cannot calculate a local production day in ${timezone}.`);
  return range.value;
};

export const productionDueBucket = (
  dueAt: Date,
  now: Date,
  timezone: string,
): ProductionDueBucket => {
  const distance = calendarDayDistance({
    from: calendarDateAt(timezone, instantFromDate(now)),
    to: calendarDateAt(timezone, instantFromDate(dueAt)),
  });

  if (distance < 0) return 'overdue';
  if (distance === 0) return 'today';
  if (distance === 1) return 'tomorrow';
  return 'later';
};

export const productionDueFilter = (
  bucket: ProductionDueBucket,
  now: Date,
  timezone: string,
): ProductionDueFilter => {
  if (bucket === 'overdue') {
    const today = requireDayRange(now, timezone, 0);
    return { dueAtOrAfter: null, dueBefore: new Date(today.startsAt) };
  }

  if (bucket === 'later') {
    const later = requireDayRange(now, timezone, 2);
    return { dueAtOrAfter: new Date(later.startsAt), dueBefore: null };
  }

  const day = requireDayRange(now, timezone, bucket === 'today' ? 0 : 1);
  return {
    dueAtOrAfter: new Date(day.startsAt),
    dueBefore: new Date(day.endsAt),
  };
};
