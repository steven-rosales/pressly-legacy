import { defineExperienceFeature } from '@pressly/cells';
import { describe, expect, it } from 'vitest';
import { presslyTopology } from '../../topology/pressly.topology.ts';
import { compileTopology } from '../../topology/src/compiler.ts';
import { resolveRepositoryOperationEvidence } from '../../topology/tooling/repository-operation-evidence.ts';
import { presslyRepositoryRoot } from '../../topology/tooling/filesystem-artifacts.ts';

const customerExperience = presslyTopology.experiences.find(
  ({ id }) => id === 'customer',
);

describe('Experience feature topology', () => {
  it('selects unique feature identities with known operation references', () => {
    const compilation = compileTopology(presslyTopology);
    expect(compilation.kind).toBe('compiled');
    if (compilation.kind === 'invalid') return;
    const features = compilation.topology.experiences.flatMap(
      (experience) => experience.features,
    );
    expect(features).toHaveLength(18);
    expect(new Set(features.map(({ id }) => id)).size).toBe(18);
    const selected = new Set(
      compilation.topology.cells.map(({ manifest }) => manifest.id),
    );
    expect(
      features.every((feature) =>
        feature.operationIds.every((operationId) => selected.has(operationId)),
      ),
    ).toBe(true);
  });

  it('rejects duplicate feature identity and source selection', () => {
    expect(customerExperience).toBeDefined();
    if (customerExperience === undefined) return;
    const duplicate = customerExperience.features[0];
    expect(duplicate).toBeDefined();
    if (duplicate === undefined) return;
    const compilation = compileTopology({
      ...presslyTopology,
      experiences: presslyTopology.experiences.map((experience) =>
        experience.id === 'customer'
          ? { ...experience, features: [...experience.features, duplicate] }
          : experience,
      ),
    });
    expect(compilation.kind).toBe('invalid');
    if (compilation.kind === 'compiled') return;
    expect(compilation.violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'duplicate_experience_feature_id',
        'duplicate_experience_feature_source',
      ]),
    );
  });

  it('rejects a feature that references an unselected operation', () => {
    expect(customerExperience).toBeDefined();
    if (customerExperience === undefined) return;
    const compilation = compileTopology({
      ...presslyTopology,
      experiences: presslyTopology.experiences.map((experience) =>
        experience.id === 'customer'
          ? {
              ...experience,
              features: [
                {
                  manifest: defineExperienceFeature({
                    id: 'customer.web.invalid',
                    uses: ['orders.not-selected.v1'],
                    stateProofs: [
                      'experiences/customer/src/web/features/pricing/invalid.test.tsx',
                    ],
                    componentProofs: [
                      'experiences/customer/src/web/features/pricing/invalid.test.tsx',
                    ],
                  }),
                  source: {
                    moduleSpecifier: '@pressly/experience-customer',
                    manifestExportName: 'customerPricingFeature',
                    repositoryPath:
                      'experiences/customer/src/web/features/pricing/feature.ts',
                  },
                },
              ],
            }
          : experience,
      ),
    });
    expect(compilation.kind).toBe('invalid');
    if (compilation.kind === 'compiled') return;
    expect(compilation.violations.map(({ code }) => code)).toContain(
      'unknown_experience_feature_operation',
    );
  });

  it('rejects a declared focused proof path that does not exist', () => {
    expect(customerExperience).toBeDefined();
    if (customerExperience === undefined) return;
    const pricing = customerExperience.features.find(
      ({ manifest }) => manifest.id === 'customer.web.pricing',
    );
    expect(pricing).toBeDefined();
    if (pricing === undefined) return;
    const definition = {
      ...presslyTopology,
      experiences: presslyTopology.experiences.map((experience) =>
        experience.id === 'customer'
          ? {
              ...experience,
              features: experience.features.map((feature) =>
                feature.manifest.id === pricing.manifest.id
                  ? {
                      ...feature,
                      manifest: defineExperienceFeature({
                        ...pricing.manifest,
                        stateProofs: [
                          'experiences/customer/src/web/features/pricing/missing.test.tsx',
                        ],
                        componentProofs: [
                          'experiences/customer/src/web/features/pricing/missing.test.tsx',
                        ],
                      }),
                    }
                  : feature,
              ),
            }
          : experience,
      ),
    };
    const compilation = compileTopology(definition);
    expect(compilation.kind).toBe('compiled');
    if (compilation.kind === 'invalid') return;
    const evidence = resolveRepositoryOperationEvidence(
      compilation.topology,
      presslyRepositoryRoot,
    );
    expect(evidence.kind).toBe('invalid');
    if (evidence.kind === 'resolved') return;
    expect(
      evidence.violations.some(
        ({ code, message }) =>
          code === 'invalid_experience_feature' &&
          message.includes('does not exist'),
      ),
    ).toBe(true);
  });

  it('rejects a proof path outside its feature declaration directory', () => {
    expect(customerExperience).toBeDefined();
    if (customerExperience === undefined) return;
    const pricing = customerExperience.features.find(
      ({ manifest }) => manifest.id === 'customer.web.pricing',
    );
    expect(pricing).toBeDefined();
    if (pricing === undefined) return;

    const compilation = compileTopology({
      ...presslyTopology,
      experiences: presslyTopology.experiences.map((experience) =>
        experience.id === 'customer'
          ? {
              ...experience,
              features: experience.features.map((feature) =>
                feature.manifest.id === pricing.manifest.id
                  ? {
                      ...feature,
                      manifest: defineExperienceFeature({
                        ...pricing.manifest,
                        stateProofs: [
                          'experiences/customer/test/web/features/pricing.test.tsx',
                        ],
                        componentProofs: [
                          'experiences/customer/test/web/features/pricing.test.tsx',
                        ],
                      }),
                    }
                  : feature,
              ),
            }
          : experience,
      ),
    });

    expect(compilation.kind).toBe('invalid');
    if (compilation.kind === 'compiled') return;
    expect(compilation.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_experience_feature',
          message: expect.stringContaining('colocated'),
        }),
      ]),
    );
  });
});
