import { describe, expect, it, vi } from 'vitest';
import type { ListProductionLocationsRepository } from '../../src/list-production-locations/list-production-locations.port.ts';
import { makeListProductionLocations } from '../../src/list-production-locations/list-production-locations.usecase.ts';

const fixedNow = new Date('2026-07-12T14:00:00.000Z');
const locations = [
  {
    id: 'location-a',
    name: 'Alpha',
    timezone: 'America/New_York',
    isActive: true,
  },
  {
    id: 'location-b',
    name: 'Beta',
    timezone: 'America/Chicago',
    isActive: false,
  },
] as const;

const setup = (repo: ListProductionLocationsRepository) =>
  makeListProductionLocations({ repo, clock: { now: () => fixedNow } });

describe('list production locations', () => {
  it('passes null as global scope and filters inactive locations by default', async () => {
    const listLocations = vi.fn(async (input) =>
      locations.filter(
        (location) => input.includeInactive || location.isActive,
      ),
    );
    const list = setup({ listLocations });

    await expect(
      list({ includeInactive: false, allowedLocationIds: null }),
    ).resolves.toEqual({
      tag: 'ok',
      value: {
        items: [locations[0]],
        asOf: fixedNow.toISOString(),
      },
    });
    expect(listLocations).toHaveBeenCalledWith({
      includeInactive: false,
      allowedLocationIds: null,
    });
  });

  it('keeps an explicit location allowlist narrow', async () => {
    const listLocations = vi.fn(async (input) =>
      locations.filter(
        (location) =>
          input.allowedLocationIds?.includes(location.id) === true &&
          (input.includeInactive || location.isActive),
      ),
    );
    const list = setup({ listLocations });

    await expect(
      list({
        includeInactive: true,
        allowedLocationIds: ['location-b'],
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { items: [locations[1]] },
    });
    await expect(
      list({ includeInactive: true, allowedLocationIds: [] }),
    ).resolves.toMatchObject({ tag: 'ok', value: { items: [] } });
  });
});
