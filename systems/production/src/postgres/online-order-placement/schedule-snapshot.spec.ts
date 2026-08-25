import { describe, expect, it } from 'vitest';
import {
  readOnlineOrderPlacementScheduleInput,
  readOnlineOrderPlacementScheduleOutput,
} from './schedule-snapshot.postgres.ts';

describe('online order placement schedule snapshots', () => {
  it('rejects malformed stored input with the established invariant', () => {
    expect(() =>
      readOnlineOrderPlacementScheduleInput({ orders: [] }),
    ).toThrowError('Stored production schedule input snapshot is invalid.');
  });

  it('rejects malformed stored output with the established invariant', () => {
    expect(() =>
      readOnlineOrderPlacementScheduleOutput({
        algorithmVersion: 'fixed-pulse-ffd-v2',
      }),
    ).toThrowError('Stored production schedule output plan is invalid.');
  });
});
