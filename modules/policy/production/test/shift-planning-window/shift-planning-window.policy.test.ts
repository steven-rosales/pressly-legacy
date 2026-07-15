import { describe, expect, it } from 'vitest';
import { evaluateShiftPlanningWindow } from '../../src/shift-planning-window/shift-planning-window.policy.ts';

const startsAt = new Date('2026-07-14T14:00:00.000Z');
const endsAt = new Date('2026-07-14T22:00:00.000Z');

describe('shift planning window policy', () => {
  it.each(['compute', 'accept'] as const)(
    'allows %s before and during a viable shift',
    (action) => {
      expect(
        evaluateShiftPlanningWindow({
          action,
          now: new Date('2026-07-14T13:00:00.000Z'),
          startsAt,
          endsAt,
        }),
      ).toEqual({ tag: 'ok', value: { allowed: true } });
      expect(
        evaluateShiftPlanningWindow({
          action,
          now: startsAt,
          startsAt,
          endsAt,
        }),
      ).toEqual({ tag: 'ok', value: { allowed: true } });
    },
  );

  it('starts only inside the shift window', () => {
    expect(
      evaluateShiftPlanningWindow({
        action: 'start',
        now: startsAt,
        startsAt,
        endsAt,
      }),
    ).toEqual({ tag: 'ok', value: { allowed: true } });
    expect(
      evaluateShiftPlanningWindow({
        action: 'start',
        now: new Date(startsAt.getTime() - 1),
        startsAt,
        endsAt,
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'PRODUCTION_SHIFT_NOT_STARTED' },
    });
  });

  it.each(['compute', 'accept', 'start'] as const)(
    'rejects %s at and after the shift end',
    (action) => {
      expect(
        evaluateShiftPlanningWindow({ action, now: endsAt, startsAt, endsAt }),
      ).toMatchObject({
        tag: 'err',
        error: { code: 'PRODUCTION_SHIFT_EXPIRED' },
      });
    },
  );

  it('rejects malformed shift windows', () => {
    expect(
      evaluateShiftPlanningWindow({
        action: 'compute',
        now: startsAt,
        startsAt: endsAt,
        endsAt: startsAt,
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'PRODUCTION_SHIFT_WINDOW_INVALID' },
    });
  });
});
