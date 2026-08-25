import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect } from 'vitest';
import { replayDeadEventCellDeclaration } from './cell.ts';
import { replayDeadEventFailure } from './decide.ts';

describe('replay-dead-event decisions', () => {
  proveOperation({
    operationId: 'ingress.replay-dead-event.v1',
    declaration: replayDeadEventCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'distinguishes missing event identity from terminal-state conflict',
        proves: ['decision'],
        run: () => {
          expect(replayDeadEventFailure.notFound()).toMatchObject({
            kind: 'not_found',
            code: 'webhook_event_not_found',
          });
          expect(replayDeadEventFailure.notReplayable()).toMatchObject({
            kind: 'conflict',
            code: 'webhook_event_not_replayable',
          });
        },
      },
    ],
  });
});
