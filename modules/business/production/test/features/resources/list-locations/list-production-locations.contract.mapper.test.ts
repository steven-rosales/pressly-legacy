import { describe, expect, it } from 'vitest';
import { toListProductionLocationsResult } from '../../../../src/features/resources/list-locations/list-production-locations.contract.mapper.ts';

describe('list production locations mapper', () => {
  it('serializes the application clock only at the response boundary', () => {
    const asOf = new Date('2026-08-02T16:00:00.000Z');

    expect(
      toListProductionLocationsResult({
        items: [
          {
            id: 'location-a',
            name: 'Alpha',
            timezone: 'America/New_York',
            isActive: true,
          },
        ],
        asOf,
      }),
    ).toEqual({
      items: [
        {
          id: 'location-a',
          name: 'Alpha',
          timezone: 'America/New_York',
          isActive: true,
        },
      ],
      asOf: '2026-08-02T16:00:00.000Z',
    });
  });
});
