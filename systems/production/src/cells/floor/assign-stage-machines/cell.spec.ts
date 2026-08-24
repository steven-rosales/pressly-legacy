import { describe, expect, it } from 'vitest';
import { assignStageMachinesCellDeclaration } from './cell.ts';

describe('assign stage machines cell declaration', () => {
  it('freezes the exact route, authorization, and write semantics', () => {
    expect(assignStageMachinesCellDeclaration).toMatchObject({
      id: 'production.assign-stage-machines.v1',
      kind: 'command',
      authorization: { capability: 'production:stage', timing: 'after-input' },
      consistency: { transaction: 'required', concurrency: 'optimistic' },
      idempotency: { required: true },
      observability: { operation: 'production.assign_stage_machines' },
    });
    expect(assignStageMachinesCellDeclaration.surfaces).toEqual([
      expect.objectContaining({
        kind: 'http',
        method: 'PUT',
        path: '/production/locations/:locationId/stages/:stageRunId/machines',
      }),
    ]);
  });
});
