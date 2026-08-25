import { proveOperation } from '@pressly/testkit/operation-proof';
import { assignStageMachinesCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { assignStageMachinesContract } from './contract.ts';

describe('assign stage machines contract', () => {
  proveOperation({
    operationId: 'production.assign-stage-machines.v1',
    declaration: assignStageMachinesCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the exact serialized command',
        proves: ['contract'],
        run: () => {
          const command = {
            locationId: 'location-1',
            stageRunId: '10000000-0000-4000-8000-000000000001',
            actorId: '10000000-0000-4000-8000-000000000002',
            expectedVersion: 2,
            idempotencyKey: 'assign-1',
            machineIds: ['10000000-0000-4000-8000-000000000003'],
          };
          expect(
            assignStageMachinesContract.input.decode(
              assignStageMachinesContract.input.encode(command),
            ),
          ).toEqual({ kind: 'valid', value: command });
        },
      },
    ],
  });

  it('rejects an empty machine selection', () => {
    expect(
      assignStageMachinesContract.input.decode({
        params: {
          locationId: 'location-1',
          stageRunId: '10000000-0000-4000-8000-000000000001',
        },
        body: {
          machineIds: [],
          expectedVersion: 2,
          idempotencyKey: 'assign-1',
        },
        actorId: 'actor-1',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });
});
