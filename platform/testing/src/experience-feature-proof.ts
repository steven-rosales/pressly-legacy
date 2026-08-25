import type {
  ExperienceFeatureManifest,
  OperationProofClaim,
} from '@pressly/cells';
import { describe, expect, it } from 'vitest';

export type ExperienceFeatureProofClaim = Extract<
  OperationProofClaim,
  'component-interaction' | 'presentation-state'
>;

export type ExperienceFeatureProofScenario = Readonly<{
  name: string;
  proves: readonly [
    ExperienceFeatureProofClaim,
    ...ExperienceFeatureProofClaim[],
  ];
  run: () => void | Promise<void>;
}>;

export type ExperienceFeatureProof = Readonly<{
  featureId: string;
  feature: Pick<ExperienceFeatureManifest, 'id'>;
  scenarios: readonly [
    ExperienceFeatureProofScenario,
    ...ExperienceFeatureProofScenario[],
  ];
}>;

export const proveExperienceFeature = (proof: ExperienceFeatureProof): void => {
  describe(`${proof.featureId} feature proof`, () => {
    it('is bound to the declared Experience feature', () => {
      expect(proof.feature.id).toBe(proof.featureId);
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
