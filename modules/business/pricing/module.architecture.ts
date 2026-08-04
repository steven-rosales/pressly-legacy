import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

export default defineModule({
  id: 'business/pricing',
  packageName: '@pressly/pricing',
  features: defineNamespace({
    catalog: defineNamespace({
      'load-pricing-catalog': defineFeature.httpQuery({
        dependsOn: ['language/pricing'],
      }),
    }),
    pricebook: defineNamespace({
      'plan-pricing-change': defineFeature.httpCommand({
        dependsOn: [
          'language/pricing-change',
          'ports/pricing-change-store',
          'adapters/http/pricing-change-failure',
        ],
      }),
      'publish-pricing-change': defineFeature.httpCommand({
        dependsOn: [
          'language/pricing-change',
          'ports/pricing-change-store',
          'adapters/http/pricing-change-failure',
        ],
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      pricing: defineFoundation.language(),
      'pricing-change': defineFoundation.language({
        dependsOn: ['language/pricing'],
      }),
    }),
    ports: defineNamespace({
      'pricing-change-store': defineFoundation.port({
        dependsOn: ['language/pricing-change'],
      }),
    }),
    adapters: defineNamespace({
      http: defineNamespace({
        'pricing-change-failure': defineFoundation.adapter({
          dependsOn: ['language/pricing-change'],
        }),
      }),
      postgres: defineNamespace({
        'pricing-change-store': defineFoundation.adapter({
          dependsOn: ['language/pricing-change', 'ports/pricing-change-store'],
        }),
      }),
    }),
  },
});
