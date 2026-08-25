import { describe, expect, it } from 'vitest';
import { projectLocationsResult } from './project.ts';

describe('list-locations projection', () => {
  it('serializes only the location projection and response timestamp', () => {
    expect(
      projectLocationsResult({
        items: [
          {
            id: 'location-1',
            name: 'Alpha',
            timezone: 'America/New_York',
            isActive: true,
          },
        ],
        asOf: new Date('2026-08-21T14:00:00.000Z'),
      }),
    ).toEqual({
      items: [
        {
          id: 'location-1',
          name: 'Alpha',
          timezone: 'America/New_York',
          isActive: true,
        },
      ],
      asOf: '2026-08-21T14:00:00.000Z',
    });
  });
});
