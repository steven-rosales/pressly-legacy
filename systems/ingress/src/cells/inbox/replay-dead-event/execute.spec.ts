import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { replayDeadEventCellDeclaration } from './cell.ts';
import { makeExecuteReplayDeadEvent } from './execute.ts';

const eventId = '81000000-0000-4000-8000-000000000001';

describe('replay-dead-event execution', () => {
  proveOperation({
    operationId: 'ingress.replay-dead-event.v1',
    declaration: replayDeadEventCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'maps every repository replay outcome',
        proves: ['executor-success'],
        run: async () => {
          for (const [stored, kind, outcome] of [
            ['queued', 'success', 'queued'],
            ['already_queued', 'success', 'already_queued'],
            ['not_found', 'failure', 'webhook_event_not_found'],
            ['not_replayable', 'failure', 'webhook_event_not_replayable'],
          ] as const) {
            const execute = makeExecuteReplayDeadEvent({
              repo: { replay: vi.fn(async () => stored) },
              clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
            });
            const result = await execute({ eventId });
            expect(result.kind).toBe(kind);
            expect(
              result.kind === 'success'
                ? result.value.outcome
                : result.failure.code,
            ).toBe(outcome);
          }
        },
      },
    ],
  });
});
