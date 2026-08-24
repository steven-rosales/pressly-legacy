import { describe, expect, it } from 'vitest';
import {
  parseExperienceFeatureProofSource,
  resolveExperienceFeatureProofSources,
} from '../../topology/tooling/experience-feature-proof-source.ts';

const validSource = `
import { proveExperienceFeature } from '@pressly/testkit/experience-feature-proof';
import { processorBoardFeature } from './feature.ts';
proveExperienceFeature({
  featureId: 'processor.production-board',
  feature: processorBoardFeature,
  scenarios: [{
    name: 'opens the board and advances one stage',
    proves: ['presentation-state', 'component-interaction'],
    run: async () => { expect(await advance()).toBe('advanced'); },
  }],
});
`;

describe('executable Experience feature proof source', () => {
  it('parses literal feature identity, declaration, claims, and scenario', () => {
    expect(
      parseExperienceFeatureProofSource({
        path: 'experiences/processor/src/features/production-board/board.test.tsx',
        source: validSource,
      }),
    ).toMatchObject({
      issues: [],
      proofs: [
        {
          featureId: 'processor.production-board',
          declarationName: 'processorBoardFeature',
          scenarios: [
            {
              name: 'opens the board and advances one stage',
              proves: ['presentation-state', 'component-interaction'],
            },
          ],
        },
      ],
    });
  });

  it('rejects bare references, invented claims, and empty runs', () => {
    const parsed = parseExperienceFeatureProofSource({
      path: 'experiences/processor/src/features/production-board/board.test.tsx',
      source: `
        import { proveExperienceFeature } from '@pressly/testkit/experience-feature-proof';
        import { processorBoardFeature } from './feature.ts';
        proveExperienceFeature(sharedProof);
        proveExperienceFeature({
          featureId: 'processor.production-board',
          feature: processorBoardFeature,
          scenarios: [{ name: 'marker', proves: ['rendered'], run: () => {} }],
        });
      `,
    });
    expect(parsed.issues.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('one inline object literal'),
        expect.stringContaining('Unknown Experience feature proof claim'),
        expect.stringContaining('non-empty inline function'),
      ]),
    );
  });

  it('rejects unrelated proof paths and declarations instead of assigning credit', () => {
    const resolution = resolveExperienceFeatureProofSources(
      [
        {
          featureId: 'processor.production-board',
          declarationExportName: 'processorProductionBoardFeature',
          declarationPath:
            'experiences/processor/src/features/production-board/feature.ts',
          stateProofs: ['experiences/processor/board.test.tsx'],
          componentProofs: ['experiences/processor/board.test.tsx'],
        },
      ],
      [
        {
          path: 'experiences/processor/unrelated.test.tsx',
          source: validSource,
        },
      ],
    );
    expect(resolution.kind).toBe('invalid');
    if (resolution.kind === 'resolved') return;
    expect(resolution.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'unexpected_experience_feature_proof',
        'invalid_experience_feature_proof',
        'missing_experience_feature_proof',
      ]),
    );
  });

  it('rejects no-op expression runs and declarations imported from unrelated modules', () => {
    const proofPath =
      'experiences/processor/src/features/production-board/board.test.tsx';
    const resolution = resolveExperienceFeatureProofSources(
      [
        {
          featureId: 'processor.production-board',
          declarationExportName: 'processorBoardFeature',
          declarationPath:
            'experiences/processor/src/features/production-board/feature.ts',
          stateProofs: [proofPath],
          componentProofs: [proofPath],
        },
      ],
      [
        {
          path: proofPath,
          source: `
            import { proveExperienceFeature } from '@pressly/testkit/experience-feature-proof';
            import { processorBoardFeature } from './unrelated.ts';
            proveExperienceFeature({
              featureId: 'processor.production-board',
              feature: processorBoardFeature,
              scenarios: [{
                name: 'marker',
                proves: ['presentation-state', 'component-interaction'],
                run: () => undefined,
              }],
            });
          `,
        },
      ],
    );

    expect(resolution.kind).toBe('invalid');
    if (resolution.kind === 'resolved') return;
    expect(resolution.issues.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('non-empty inline function'),
        expect.stringContaining('must be imported from'),
      ]),
    );
  });

  it('rejects a declared proof outside the feature declaration directory', () => {
    const proofPath = 'experiences/processor/test/production-board.test.tsx';
    const resolution = resolveExperienceFeatureProofSources(
      [
        {
          featureId: 'processor.production-board',
          declarationExportName: 'processorBoardFeature',
          declarationPath:
            'experiences/processor/src/features/production-board/feature.ts',
          stateProofs: [proofPath],
          componentProofs: [proofPath],
        },
      ],
      [
        {
          path: proofPath,
          source: `
            import { proveExperienceFeature } from '@pressly/testkit/experience-feature-proof';
            import { processorBoardFeature } from '../src/features/production-board/feature.ts';
            proveExperienceFeature({
              featureId: 'processor.production-board',
              feature: processorBoardFeature,
              scenarios: [{
                name: 'renders the selected board',
                proves: ['presentation-state', 'component-interaction'],
                run: () => { expect(renderBoard()).toBeDefined(); },
              }],
            });
          `,
        },
      ],
    );

    expect(resolution.kind).toBe('invalid');
    if (resolution.kind === 'resolved') return;
    expect(resolution.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_experience_feature_proof',
          path: proofPath,
          message: expect.stringContaining('must be colocated'),
        }),
      ]),
    );
  });
});
