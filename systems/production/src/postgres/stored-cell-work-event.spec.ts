import { decode, defineBoundaryContract } from '@pressly/cells';
import { describe, expect, it } from 'vitest';
import { decodeStoredCellWorkEvent } from './stored-cell-work-event.postgres.ts';

const outputContract = defineBoundaryContract<
  Readonly<{ entityId: string; version: number }>
>({
  version: 1,
  decode: (serialized) =>
    typeof serialized === 'object' &&
    serialized !== null &&
    'entityId' in serialized &&
    typeof serialized.entityId === 'string' &&
    'version' in serialized &&
    typeof serialized.version === 'number'
      ? decode.valid({
          entityId: serialized.entityId,
          version: serialized.version,
        })
      : decode.invalid([{ path: [], message: 'Invalid stored result.' }]),
  encode: (value) => value,
});

describe('decodeStoredCellWorkEvent', () => {
  it('returns a typed result only after the owning output contract accepts it', () => {
    expect(
      decodeStoredCellWorkEvent(outputContract, {
        _idempotency: {
          version: 1,
          command: { operation: 'production.example' },
          result: { entityId: 'entity-1', version: 2 },
        },
      }),
    ).toEqual({
      command: { operation: 'production.example' },
      result: { entityId: 'entity-1', version: 2 },
      valid: true,
    });
  });

  it.each([
    null,
    { _idempotency: { version: 2, command: {}, result: {} } },
    { _idempotency: { version: 1, command: 'invalid', result: {} } },
    {
      _idempotency: {
        version: 1,
        command: {},
        result: { entityId: 1, version: 2 },
      },
    },
  ])('keeps malformed stored envelopes on the conflict rail', (envelope) => {
    expect(decodeStoredCellWorkEvent(outputContract, envelope)).toEqual({
      command: {},
      result: {},
      valid: false,
    });
  });
});
