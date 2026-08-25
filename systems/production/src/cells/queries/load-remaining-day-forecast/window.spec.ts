import { describe, expect, it } from 'vitest';
import {
  parseProductionServiceDay,
  productionServiceDayWindow,
} from './window.ts';

const asOf = new Date('2026-07-01T12:00:00.000Z');

describe('production service-day window', () => {
  it.each(['2024-02-29', '2026-03-08', '2026-11-01'])(
    'accepts real Gregorian date %s',
    (serviceDay) => {
      expect(parseProductionServiceDay(serviceDay)).not.toBeNull();
    },
  );

  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '07-26-2026',
    '2026-07-26T00:00:00Z',
  ])('rejects invalid service day %s', (serviceDay) => {
    expect(parseProductionServiceDay(serviceDay)).toBeNull();
    expect(
      productionServiceDayWindow({
        timezone: 'America/New_York',
        asOf,
        serviceDay,
      }),
    ).toBeNull();
  });

  it('preserves the 23-hour spring-forward service day', () => {
    const window = productionServiceDayWindow({
      timezone: 'America/New_York',
      asOf,
      serviceDay: '2026-03-08',
    });
    expect(window).toEqual({
      startsAt: new Date('2026-03-08T05:00:00.000Z'),
      endsAt: new Date('2026-03-09T04:00:00.000Z'),
    });
    expect(
      window === null
        ? null
        : window.endsAt.getTime() - window.startsAt.getTime(),
    ).toBe(23 * 60 * 60 * 1_000);
  });

  it('preserves the 25-hour fall-back service day', () => {
    const window = productionServiceDayWindow({
      timezone: 'America/New_York',
      asOf,
      serviceDay: '2026-11-01',
    });
    expect(window).toEqual({
      startsAt: new Date('2026-11-01T04:00:00.000Z'),
      endsAt: new Date('2026-11-02T05:00:00.000Z'),
    });
    expect(
      window === null
        ? null
        : window.endsAt.getTime() - window.startsAt.getTime(),
    ).toBe(25 * 60 * 60 * 1_000);
  });
});
