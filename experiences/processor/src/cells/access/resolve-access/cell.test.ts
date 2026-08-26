import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { resolveProcessorAccessCellDeclaration } from './cell.ts';
import { resolveProcessorAccess } from './policy.ts';
import { resolveProcessorAccessProtocol } from './protocol.ts';
import { expectProcessorOperationSuccess } from '../../../../test/support/processor-operation-proof.ts';

proveOperation({
  operationId: 'processor.resolve-access.v1',
  declaration: resolveProcessorAccessCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'resolve access rejects an empty production scope and executes a visible scope',
      proves: ['contract', 'decision', 'protocol', 'executor-success'],
      run: async () => {
        expect(
          resolveProcessorAccessCellDeclaration.contract.input.version,
        ).toBe(1);
        expect(
          resolveProcessorAccessCellDeclaration.contract.output.version,
        ).toBe(1);
        expect(
          resolveProcessorAccessCellDeclaration.contract.failure.version,
        ).toBe(1);
        expect(resolveProcessorAccessCellDeclaration.surfaces).toEqual([]);
        expect(resolveProcessorAccessProtocol).toEqual({
          kind: 'internal-query',
          authentication: 'required',
        });
        expect(
          resolveProcessorAccess({
            session: {
              principal: {
                identityId: '11111111-1111-4111-8111-111111111111',
                kind: 'human',
                displayName: 'Operator',
              },
              principalAttributes: {
                assignments: [],
                identityActive: true,
              },
            },
            locations: [],
            origins: {
              processor: 'https://processor.pressly.test',
              control: 'https://control.pressly.test',
            },
            now: new Date('2026-08-22T20:00:00.000Z'),
            resolveCapabilities: () => [],
          } as never),
        ).toBeNull();
        await expectProcessorOperationSuccess('processor.resolve-access.v1');
      },
    },
  ],
});
