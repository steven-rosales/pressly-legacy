import { describe, expect, it } from 'vitest';
import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
  defineRepository,
  featureProfiles,
  foundationProfiles,
} from '../architecture/architecture-definition.factory.ts';
import {
  compileArchitecture,
  roleForFileName,
  validateArchitecture,
} from '../architecture/architecture-compiler.ts';

const repository = defineRepository({
  name: 'test-repository',
  moduleFamilies: ['business'],
  moduleRootFiles: ['main.ts', 'public.ts'],
  packageKinds: {},
});

const exampleModule = () =>
  defineModule({
    id: 'business/pricing',
    packageName: '@example/pricing',
    features: defineNamespace({
      customer: defineNamespace({
        catalog: defineNamespace({
          'load-pricing-catalog': defineFeature.httpQuery({
            dependsOn: ['language/pricing'],
          }),
        }),
      }),
      'change-control': defineNamespace({
        'publish-pricing': defineFeature.httpCommand({
          dependsOn: ['algorithms/pricing-plan'],
        }),
      }),
    }),
    foundations: {
      language: defineNamespace({
        pricing: defineFoundation.language(),
      }),
      algorithms: defineNamespace({
        'pricing-plan': defineFoundation.algorithm({
          dependsOn: ['language/pricing'],
        }),
      }),
      ports: defineNamespace({
        catalog: defineFoundation.port({
          dependsOn: ['language/pricing'],
        }),
      }),
      adapters: defineNamespace({
        postgres: defineFoundation.adapter({
          dependsOn: ['ports/catalog'],
        }),
      }),
    },
  });

describe('architecture compiler v2', () => {
  it('flattens arbitrary namespace depth and classifies the longest declared owner', () => {
    const architecture = compileArchitecture(repository, [exampleModule()]);
    const module = architecture.modules.get('business/pricing');

    expect(module?.layout).toBe('feature-foundation-v2');
    expect([...module.features.keys()]).toEqual([
      'customer/catalog/load-pricing-catalog',
      'change-control/publish-pricing',
    ]);
    expect(
      architecture.classifySource(
        'business/pricing',
        'features/customer/catalog/load-pricing-catalog/load-pricing-catalog.usecase.ts',
      ),
    ).toEqual({
      zone: 'feature',
      owner: 'customer/catalog/load-pricing-catalog',
      role: 'usecase',
    });
  });

  it('allows only explicit feature-to-foundation and foundation-to-foundation edges', () => {
    const architecture = compileArchitecture(repository, [exampleModule()]);
    const evaluate = (sourceRelativePath, targetRelativePath) =>
      architecture.evaluateSourceDependency({
        moduleKey: 'business/pricing',
        sourceRelativePath,
        targetRelativePath,
      });

    expect(
      evaluate(
        'features/customer/catalog/load-pricing-catalog/load.usecase.ts',
        'foundations/language/pricing/pricing.model.ts',
      ),
    ).toEqual({ allowed: true, reason: 'declared_feature_foundation' });
    expect(
      evaluate(
        'features/customer/catalog/load-pricing-catalog/load.usecase.ts',
        'foundations/ports/catalog/catalog.port.ts',
      ),
    ).toEqual({ allowed: false, reason: 'undeclared_feature_foundation' });
    expect(
      evaluate(
        'features/customer/catalog/load-pricing-catalog/load.usecase.ts',
        'features/change-control/publish-pricing/publish.usecase.ts',
      ),
    ).toEqual({ allowed: false, reason: 'sibling_feature' });
    expect(
      evaluate(
        'foundations/algorithms/pricing-plan/plan.algorithm.ts',
        'foundations/language/pricing/pricing.model.ts',
      ),
    ).toEqual({
      allowed: true,
      reason: 'declared_foundation_dependency',
    });
    expect(
      evaluate(
        'foundations/language/pricing/pricing.model.ts',
        'features/customer/catalog/load-pricing-catalog/load.model.ts',
      ),
    ).toEqual({ allowed: false, reason: 'foundation_to_feature' });
  });

  it('keeps root composition and public edges narrow and explicit', () => {
    const architecture = compileArchitecture(repository, [exampleModule()]);
    const evaluate = (sourceRelativePath, targetRelativePath) =>
      architecture.evaluateSourceDependency({
        moduleKey: 'business/pricing',
        sourceRelativePath,
        targetRelativePath,
      });

    expect(evaluate('main.ts', 'composition/pricing.composition.ts')).toEqual({
      allowed: true,
      reason: 'module_composition_surface',
    });
    expect(evaluate('public.ts', 'main.ts')).toEqual({
      allowed: true,
      reason: 'public_surface',
    });
    expect(
      evaluate(
        'public.ts',
        'features/customer/catalog/load-pricing-catalog/load.model.ts',
      ),
    ).toEqual({ allowed: true, reason: 'public_surface' });
    expect(
      evaluate(
        'main.ts',
        'features/customer/catalog/load-pricing-catalog/load.usecase.ts',
      ),
    ).toEqual({ allowed: false, reason: 'invalid_root_dependency' });
    expect(
      evaluate(
        'features/customer/catalog/load-pricing-catalog/load.usecase.ts',
        'public.ts',
      ),
    ).toEqual({ allowed: false, reason: 'invalid_root_dependency' });
  });

  it('uses profiles as legal-role and minimum-anchor declarations without ceremonial files', () => {
    expect(featureProfiles['http-command'].requiredRoles).toEqual([
      'route',
      'controller',
      'usecase',
    ]);
    expect(featureProfiles['http-command'].requiredRoles).not.toContain(
      'contract.mapper',
    );
    expect(featureProfiles['message-consumer'].requiredRoles).toEqual([
      'usecase',
    ]);
    expect(featureProfiles['headless-query'].allowedRoles).toContain(
      'projection.mapper',
    );
    expect(foundationProfiles.language.allowedRoles).toContain('factory');
    expect(foundationProfiles.adapter.requiredAnyRole).toEqual([
      'adapter',
      'repo',
      'contract.mapper',
      'persistence.mapper',
    ]);
    expect(featureProfiles['headless-command'].allowedRoles).not.toContain(
      'factory',
    );
  });

  it('recognizes only qualified mapper roles and retains restricted factories', () => {
    expect(roleForFileName('pricing.contract.mapper.ts')).toBe(
      'contract.mapper',
    );
    expect(roleForFileName('pricing.persistence.mapper.ts')).toBe(
      'persistence.mapper',
    );
    expect(roleForFileName('pricing.projection.mapper.ts')).toBe(
      'projection.mapper',
    );
    expect(roleForFileName('pricing.mapper.ts')).toBeNull();
    expect(roleForFileName('scheduling-registry.factory.ts')).toBe('factory');
  });

  it('rejects foundation cycles and feature leaves without a namespace', () => {
    const invalidModule = defineModule({
      id: 'business/pricing',
      packageName: '@example/pricing',
      features: defineNamespace({
        'load-pricing': defineFeature.headlessQuery(),
      }),
      foundations: {
        language: defineNamespace({
          first: defineFoundation.language({
            dependsOn: ['language/second'],
          }),
          second: defineFoundation.language({
            dependsOn: ['language/first'],
          }),
        }),
      },
    });

    expect(validateArchitecture(repository, [invalidModule])).toEqual(
      expect.arrayContaining([
        'Feature "load-pricing" must sit below at least one named namespace.',
        'Module "business/pricing" has a foundation cycle: language/first -> language/second -> language/first.',
      ]),
    );
  });
});
