import { describe, expect, it } from 'vitest';
import { toSessionInventoryResult } from '../../../../src/features/sessions/list-identity-sessions/list-identity-sessions.contract.mapper.ts';

describe('list identity sessions response mapping', () => {
  it('serializes session dates only at the HTTP edge', () => {
    expect(
      toSessionInventoryResult({
        sessions: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            issuedAt: new Date('2026-06-29T10:00:00.000Z'),
            lastUsedAt: new Date('2026-06-29T11:55:00.000Z'),
            expiresAt: new Date('2026-06-29T22:00:00.000Z'),
            revokedAt: new Date('2026-06-29T12:00:00.000Z'),
          },
        ],
      }),
    ).toEqual({
      sessions: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          issuedAt: '2026-06-29T10:00:00.000Z',
          lastUsedAt: '2026-06-29T11:55:00.000Z',
          expiresAt: '2026-06-29T22:00:00.000Z',
          revokedAt: '2026-06-29T12:00:00.000Z',
        },
      ],
    });
  });
});
