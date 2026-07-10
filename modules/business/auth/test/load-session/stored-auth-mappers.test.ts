import { describe, expect, it } from 'vitest';
import { mapStoredAssignments } from '../../src/load-session/stored-assignments.mapper.ts';
import { mapStoredRoles } from '../../src/persistence/stored-roles.mapper.ts';

describe('mapStoredRoles', () => {
  it('keeps valid stored roles and filters unknown values', () => {
    expect(
      mapStoredRoles([
        { role: 'admin' },
        { role: 'not-a-real-role' },
        { role: 'owner' },
      ]),
    ).toEqual(['admin', 'owner']);
  });
});

describe('mapStoredAssignments', () => {
  it('keeps valid assignments and maps stored scope shapes', () => {
    expect(
      mapStoredAssignments([
        {
          role: 'admin',
          scopeKind: 'global',
          scopeId: '*',
          scopeResourceType: '*',
          startsAt: null,
          endsAt: null,
        },
        {
          role: 'operator',
          scopeKind: 'location',
          scopeId: 'location_main',
          scopeResourceType: '*',
          startsAt: new Date('2026-06-01T00:00:00.000Z'),
          endsAt: null,
        },
        {
          role: 'service',
          scopeKind: 'resource',
          scopeId: 'catalog_1',
          scopeResourceType: 'pricing.catalog',
          startsAt: null,
          endsAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          role: 'not-a-real-role',
          scopeKind: 'global',
          scopeId: '*',
          scopeResourceType: '*',
          startsAt: null,
          endsAt: null,
        },
      ]),
    ).toEqual([
      { role: 'admin', scope: { kind: 'global', id: '*' } },
      {
        role: 'operator',
        scope: { kind: 'location', id: 'location_main' },
        startsAt: new Date('2026-06-01T00:00:00.000Z'),
      },
      {
        role: 'service',
        scope: {
          kind: 'resource',
          type: 'pricing.catalog',
          id: 'catalog_1',
        },
        endsAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
  });
});
