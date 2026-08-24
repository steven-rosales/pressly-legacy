import { describe, expect, it } from 'vitest';
import { operationProofClaims } from '@pressly/cells/operation-proof';
import { proveOperation } from '../src/operation-proof.ts';

proveOperation({
  operationId: 'testing.prove-operation.v1',
  declaration: { id: 'testing.prove-operation.v1' },
  layer: 'unit',
  scenarios: [
    {
      name: 'executes a typed scenario',
      proves: ['executor-success'],
      run: () => {
        expect(true).toBe(true);
      },
    },
  ],
});

describe('operation proof vocabulary', () => {
  it('keeps every claim unique', () => {
    expect(new Set(operationProofClaims).size).toBe(
      operationProofClaims.length,
    );
  });
});
