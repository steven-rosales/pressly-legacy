import type { Clock } from '@pressly/time';

export type MutableClock = Clock &
  Readonly<{
    set: (instant: Date) => void;
    advanceBy: (milliseconds: number) => void;
  }>;

const timestampOf = (instant: Date): number => instant.getTime();
const dateFromTimestamp = (timestamp: number): Date => new Date(timestamp);

export const makeFixedClock = (instant: Date): Clock => {
  const timestamp = timestampOf(instant);
  return Object.freeze({ now: () => dateFromTimestamp(timestamp) });
};

export const makeMutableClock = (initial: Date): MutableClock => {
  let timestamp = timestampOf(initial);

  return Object.freeze({
    now: () => dateFromTimestamp(timestamp),
    set: (instant: Date): void => {
      timestamp = timestampOf(instant);
    },
    advanceBy: (milliseconds: number): void => {
      timestamp += milliseconds;
    },
  });
};
