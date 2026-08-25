import { describe, expect, it } from 'vitest';
import type { AdvanceStageWorkEventCommand } from './execute.ts';
import {
  resolveAdvanceStageReplay,
  serializeAdvanceStageWorkEventCommand,
} from './idempotency.ts';

const command = (
  input: Partial<AdvanceStageWorkEventCommand> = {},
): AdvanceStageWorkEventCommand => ({
  operation: 'stage_started',
  locationId: 'location-1',
  actorId: '10000000-0000-4000-8000-000000000001',
  target: {
    entityType: 'stage_run',
    entityId: '10000000-0000-4000-8000-000000000002',
  },
  expectedVersion: 3,
  payload: { transition: 'start' },
  ...input,
});

describe('advance-stage canonical idempotency', () => {
  it('misses when no work event exists', () => {
    expect(resolveAdvanceStageReplay(null, command())).toEqual({
      kind: 'miss',
    });
  });

  it('replays an identical canonical command and marks its result', () => {
    const expected = command();
    const serialized = serializeAdvanceStageWorkEventCommand(expected);
    const storedWithDifferentKeyOrder = Object.fromEntries(
      Object.entries(serialized).reverse(),
    );

    expect(
      resolveAdvanceStageReplay(
        {
          command: storedWithDifferentKeyOrder,
          result: {
            entityId: expected.target.entityId,
            version: 4,
            replayed: false,
          },
          valid: true,
        },
        expected,
      ),
    ).toEqual({
      kind: 'replay',
      result: {
        entityId: expected.target.entityId,
        version: 4,
        replayed: true,
      },
    });
  });

  it('conflicts for a different payload under the same key', () => {
    const expected = command();
    expect(
      resolveAdvanceStageReplay(
        {
          command: serializeAdvanceStageWorkEventCommand({
            ...expected,
            payload: {
              transition: 'start',
              confirmation: {
                observedAt: '2026-08-21T14:30:00.000Z',
                confirmationHash: 'c'.repeat(64),
              },
            },
          }),
          result: {
            entityId: expected.target.entityId,
            version: 4,
            replayed: false,
          },
          valid: true,
        },
        expected,
      ),
    ).toEqual({ kind: 'conflict' });
  });

  it('fails closed for an invalid stored envelope', () => {
    expect(
      resolveAdvanceStageReplay(
        { command: {}, result: {}, valid: false },
        command(),
      ),
    ).toEqual({ kind: 'conflict' });
  });
});
