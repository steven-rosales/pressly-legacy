import type { CellManifest } from '@pressly/cells';
import type {
  OperationProofClaim,
  OperationProofLayer,
} from '@pressly/cells/operation-proof';
import { describe, expect, it } from 'vitest';

export type OperationProofScenario = Readonly<{
  name: string;
  proves: readonly [OperationProofClaim, ...OperationProofClaim[]];
  run: () => void | Promise<void>;
}>;

export type OperationProof = Readonly<{
  operationId: string;
  declaration: Pick<CellManifest, 'id'>;
  layer: OperationProofLayer;
  scenarios: readonly [OperationProofScenario, ...OperationProofScenario[]];
}>;

/**
 * Registers named, typed scenarios against one exact cell declaration.
 *
 * The literal `operationId` and `proves` values are deliberately present in
 * the test source. Repository verification reads only this explicit form; it
 * never assigns proof through substring matches, imports, or owner fallback.
 */
export const proveOperation = (proof: OperationProof): void => {
  describe(`${proof.operationId} ${proof.layer} proof`, () => {
    it('is bound to the selected cell declaration', () => {
      expect(proof.declaration.id).toBe(proof.operationId);
    });

    it('uses unique non-empty scenario names and claims', () => {
      expect(proof.scenarios.every(({ name }) => name.trim().length > 0)).toBe(
        true,
      );
      expect(new Set(proof.scenarios.map(({ name }) => name)).size).toBe(
        proof.scenarios.length,
      );
      expect(proof.scenarios.every(({ proves }) => proves.length > 0)).toBe(
        true,
      );
    });

    for (const scenario of proof.scenarios)
      it(`${scenario.name} [${scenario.proves.join(', ')}]`, scenario.run);
  });
};
