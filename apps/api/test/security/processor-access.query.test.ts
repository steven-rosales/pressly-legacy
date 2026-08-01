import type { LoadedProcessorSession } from '../../src/http/processor/session/processor-session.port.ts';
import {
  resolveProcessorAccessFromLocations,
  type ProcessorLocationAuthority,
} from '../../src/http/processor/session/processor-access.query.ts';
import { describe, expect, it } from 'vitest';

const now = new Date('2026-07-29T18:00:00.000Z');
const locations: readonly ProcessorLocationAuthority[] = [
  {
    id: 'location-a',
    businessId: '00000000-0000-4000-8000-00000000000a',
    name: 'Location A',
    timezone: 'America/New_York',
  },
  {
    id: 'location-b',
    businessId: '00000000-0000-4000-8000-00000000000b',
    name: 'Location B',
    timezone: 'America/Chicago',
  },
];

const session = (
  assignments: LoadedProcessorSession['principalAttributes']['assignments'],
  assuranceLevel: 'password' | 'mfa' = 'password',
): LoadedProcessorSession => ({
  principal: {
    identityId: '00000000-0000-4000-8000-000000000001',
    kind: 'human',
    displayName: 'Pressly teammate',
    email: 'teammate@example.com',
    sessionId: '00000000-0000-4000-8000-000000000002',
    sessionIssuedAt: new Date('2026-07-29T17:00:00.000Z'),
    sessionExpiresAt: new Date('2026-07-29T19:00:00.000Z'),
  },
  principalAttributes: {
    identityActive: true,
    assuranceLevel,
    assignments,
  },
});

const resolve = (loadedSession: LoadedProcessorSession) =>
  resolveProcessorAccessFromLocations({
    session: loadedSession,
    locations,
    processorOrigin: 'https://processor.trypressly.com',
    controlOrigin: 'https://control.trypressly.com',
    now,
  });

describe('Processor access projection', () => {
  it('exposes only exact-location operator capabilities and no Control switch', () => {
    const access = resolve(
      session([
        {
          role: 'operator',
          scope: { kind: 'location', id: 'location-a' },
        },
      ]),
    );

    expect(access?.locations).toHaveLength(1);
    expect(access?.locations[0]).toMatchObject({
      id: 'location-a',
      capabilities: expect.arrayContaining([
        'processor:view',
        'production:read',
        'production:intake',
        'production:stage',
        'production:queue',
      ]),
    });
    expect(access?.locations[0]?.capabilities).not.toContain(
      'production:override',
    );
    expect(access?.applications.map(({ id }) => id)).toEqual(['processor']);
  });

  it('adds Control only for one unambiguous manager business', () => {
    const businessId = locations[0]!.businessId;
    const access = resolve(
      session(
        [{ role: 'manager', scope: { kind: 'business', id: businessId } }],
        'mfa',
      ),
    );

    expect(access?.locations).toHaveLength(1);
    expect(access?.locations[0]?.capabilities).toContain('production:override');
    expect(access?.applications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'control',
          href: 'https://control.trypressly.com',
        }),
      ]),
    );
  });

  it('inherits a business grant only into that business location graph', () => {
    const access = resolve(
      session(
        [
          {
            role: 'manager',
            scope: {
              kind: 'business',
              id: locations[0]!.businessId,
            },
          },
        ],
        'mfa',
      ),
    );

    expect(access?.locations.map(({ id }) => id)).toEqual(['location-a']);
    expect(access?.locations[0]?.capabilities).toContain('production:override');
  });

  it('withholds the Control switch when grants span multiple businesses', () => {
    const access = resolve(
      session(
        locations.map((location) => ({
          role: 'manager' as const,
          scope: { kind: 'business' as const, id: location.businessId },
        })),
        'mfa',
      ),
    );

    expect(access?.locations).toHaveLength(2);
    expect(access?.applications.map(({ id }) => id)).toEqual(['processor']);
  });
});
