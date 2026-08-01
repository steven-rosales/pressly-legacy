import { describe, expect, it } from 'vitest';
import {
  decodeWorkforceCursor,
  encodeWorkforceCursor,
} from '../../src/workforce-pagination.policy.ts';

describe('workforce pagination cursor', () => {
  it('round-trips a stable created-at and id boundary without exposing query text', () => {
    const boundary = {
      createdAt: new Date('2026-07-29T12:00:00.000Z'),
      id: '0198f934-8ad2-7000-8000-000000000001',
    };
    const encoded = encodeWorkforceCursor(boundary);

    expect(encoded).not.toContain(boundary.id);
    expect(decodeWorkforceCursor(encoded)).toEqual({
      tag: 'ok',
      value: boundary,
    });
  });

  it.each(['', 'not-base64-json', Buffer.from('{}').toString('base64url')])(
    'rejects malformed cursor %j at the application boundary',
    (cursor) => {
      const decoded = decodeWorkforceCursor(cursor);
      expect(decoded.tag).toBe('err');
      if (decoded.tag === 'err')
        expect(decoded.error.code).toBe('invalid_workforce_cursor');
    },
  );
});
