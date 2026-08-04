import { describe, expect, it } from 'vitest';
import { defineBoundCursor } from '../src/bound-cursor.ts';

type CursorPoint = Readonly<{ createdAt: Date; id: string }>;

const cursor = defineBoundCursor<Readonly<{ status?: string }>, CursorPoint>({
  version: 1,
  kind: 'example',
  projectFilter: (filter) => ({ status: filter.status ?? null }),
  encodePoint: (point) => ({
    createdAt: point.createdAt.toISOString(),
    id: point.id,
  }),
  decodePoint: (encoded) => {
    const createdAt = encoded['createdAt'];
    const id = encoded['id'];
    if (typeof createdAt !== 'string' || typeof id !== 'string') return null;
    const parsed = new Date(createdAt);
    return Number.isFinite(parsed.getTime()) ? { createdAt: parsed, id } : null;
  },
});

describe('defineBoundCursor', () => {
  it('round-trips the existing byte representation for its kind and filter', () => {
    const filter = { status: 'completed' };
    const point = {
      createdAt: new Date('2026-08-02T13:00:00.000Z'),
      id: 'item-1',
    };
    const encoded = cursor.encode(filter, point);

    expect(encoded).toBe(
      'eyJ2ZXJzaW9uIjoxLCJraW5kIjoiZXhhbXBsZSIsImZpbHRlcktleSI6IntcInN0YXR1c1wiOlwiY29tcGxldGVkXCJ9IiwiY3JlYXRlZEF0IjoiMjAyNi0wOC0wMlQxMzowMDowMC4wMDBaIiwiaWQiOiJpdGVtLTEifQ',
    );
    expect(cursor.decode(encoded, filter)).toEqual(point);
    expect(cursor.decode(encoded, { status: 'started' })).toBeNull();

    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      version: 1,
      kind: 'example',
      filterKey: JSON.stringify(filter),
      id: 'item-1',
    });
  });

  it('fails closed for malformed envelopes and invalid points', () => {
    expect(cursor.decode('not-a-cursor', {})).toBeNull();
    expect(
      cursor.decode(
        Buffer.from(
          JSON.stringify({
            version: 1,
            kind: 'example',
            filterKey: JSON.stringify({ status: null }),
            createdAt: 'not-a-date',
            id: 'item-1',
          }),
        ).toString('base64url'),
        {},
      ),
    ).toBeNull();
  });

  it('supports compatible envelopes that do not need a kind discriminator', () => {
    const untyped = defineBoundCursor<null, Readonly<{ id: string }>>({
      version: 1,
      projectFilter: () => ({}),
      encodePoint: (point) => point,
      decodePoint: (encoded) =>
        typeof encoded['id'] === 'string' ? { id: encoded['id'] } : null,
    });
    const encoded = untyped.encode(null, { id: 'item-1' });
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    expect(payload).not.toHaveProperty('kind');
    expect(untyped.decode(encoded, null)).toEqual({ id: 'item-1' });
  });

  it('keeps the factory-owned envelope authoritative over point fields', () => {
    const codec = defineBoundCursor<null, null>({
      version: 3,
      kind: 'owned',
      projectFilter: () => ({}),
      encodePoint: () => ({
        version: 99,
        kind: 'forged',
        filterKey: 'forged',
        id: 'item-1',
      }),
      decodePoint: (encoded) => (encoded['id'] === 'item-1' ? null : null),
    });
    const encoded = codec.encode(null, null);
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    expect(payload).toMatchObject({
      version: 3,
      kind: 'owned',
      filterKey: '{}',
      id: 'item-1',
    });
  });
});
