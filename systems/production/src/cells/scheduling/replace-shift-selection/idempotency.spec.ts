import { describe, expect, it } from 'vitest';
import type { ReplaceShiftSelectionWorkEventCommand } from './execute.ts';
import {
  resolveReplaceShiftSelectionReplay,
  serializeReplaceShiftSelectionWorkEventCommand,
} from './idempotency.ts';
import type { ReplaceShiftSelectionResult } from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  order: '10000000-0000-4000-8000-000000000003',
} as const;

const command: ReplaceShiftSelectionWorkEventCommand = {
  operation: 'production_shift_selection_replaced',
  locationId: 'location-1',
  actorId: ids.actor,
  target: { entityType: 'production_shift', entityId: ids.shift },
  expectedVersion: 1,
  payload: { selectedOrderIds: [ids.order] },
};

const result: ReplaceShiftSelectionResult = {
  selection: {
    productionShiftId: ids.shift,
    version: 2,
    selectedOrderIds: [ids.order],
  },
  supersededScheduleRunId: null,
  replayed: false,
};

describe('replace shift selection idempotency', () => {
  it('serializes the stable command identity', () => {
    expect(serializeReplaceShiftSelectionWorkEventCommand(command)).toEqual({
      operation: 'production_shift_selection_replaced',
      locationId: 'location-1',
      actorId: ids.actor,
      target: { entityType: 'production_shift', entityId: ids.shift },
      expectedVersion: 1,
      payload: { selectedOrderIds: [ids.order] },
    });
  });

  it('distinguishes miss, replay, malformed receipt, and divergent reuse', () => {
    expect(resolveReplaceShiftSelectionReplay(null, command)).toEqual({
      kind: 'miss',
    });
    expect(
      resolveReplaceShiftSelectionReplay(
        {
          command: serializeReplaceShiftSelectionWorkEventCommand(command),
          result,
          valid: true,
        },
        command,
      ),
    ).toEqual({ kind: 'replay', result: { ...result, replayed: true } });
    expect(
      resolveReplaceShiftSelectionReplay(
        { command: {}, result: {}, valid: false },
        command,
      ),
    ).toEqual({ kind: 'conflict' });

    for (const divergent of [
      {
        ...serializeReplaceShiftSelectionWorkEventCommand(command),
        actorId: '10000000-0000-4000-8000-000000000009',
      },
      {
        ...serializeReplaceShiftSelectionWorkEventCommand(command),
        expectedVersion: 2,
      },
      {
        ...serializeReplaceShiftSelectionWorkEventCommand(command),
        payload: { selectedOrderIds: [] },
      },
    ])
      expect(
        resolveReplaceShiftSelectionReplay(
          { command: divergent, result, valid: true },
          command,
        ),
      ).toEqual({ kind: 'conflict' });
  });
});
