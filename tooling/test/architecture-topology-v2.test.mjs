import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
  defineRepository,
} from '../architecture/architecture-definition.factory.ts';
import {
  auditRepositoryArchitecture,
  formatFoundationCohesionReport,
} from '../architecture/architecture-check.ts';
import {
  compileArchitecture,
  reportFoundationCohesion,
} from '../architecture/architecture-compiler.ts';
import { observeRepositoryOwnerDependencies } from '../architecture/architecture-source-graph.ts';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { force: true, recursive: true });
});

const write = (root, relativePath, source = 'export {};') => {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, source);
};

const architecture = compileArchitecture(
  defineRepository({
    name: 'topology-fixture',
    moduleFamilies: ['business'],
    moduleRootFiles: ['main.ts', 'public.ts'],
    packageKinds: {},
  }),
  [
    defineModule({
      id: 'business/pricing',
      packageName: '@example/pricing',
      features: defineNamespace({
        catalog: defineNamespace({
          'load-pricing': defineFeature.headlessQuery({
            dependsOn: ['language/pricing'],
          }),
          'preview-pricing': defineFeature.headlessQuery({
            dependsOn: ['language/pricing'],
          }),
        }),
      }),
      foundations: {
        language: defineNamespace({
          pricing: defineFoundation.language(),
        }),
      },
    }),
  ],
);

const validFixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pressly-topology-'));
  temporaryRoots.push(root);
  const moduleRoot = 'modules/business/pricing';
  write(root, `${moduleRoot}/src/main.ts`);
  write(root, `${moduleRoot}/src/public.ts`);
  write(
    root,
    `${moduleRoot}/src/features/catalog/load-pricing/load-pricing.usecase.ts`,
    `import type { Pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export type LoadPricing = () => Pricing; export const makeLoadPricing = (): LoadPricing => () => 'pricing';`,
  );
  write(
    root,
    `${moduleRoot}/src/features/catalog/preview-pricing/preview-pricing.usecase.ts`,
    `import type { Pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export type PreviewPricing = () => Pricing; export const makePreviewPricing = (): PreviewPricing => () => 'pricing';`,
  );
  write(
    root,
    `${moduleRoot}/src/foundations/language/pricing/pricing.model.ts`,
    'export type Pricing = string;',
  );
  write(root, `${moduleRoot}/test/support/pricing.builder.ts`);
  write(
    root,
    `${moduleRoot}/test/features/catalog/load-pricing/load-pricing.test.ts`,
  );
  return root;
};

describe('architecture compiler v2 topology audit', () => {
  it('accepts nonempty declared owners, mirrored tests, and narrow test support', () => {
    const root = validFixture();
    expect(auditRepositoryArchitecture(root, architecture)).toEqual([]);
  });

  it('rejects bare mapper roles and tests without a declared owner', () => {
    const root = validFixture();
    write(
      root,
      'modules/business/pricing/src/features/catalog/load-pricing/pricing.mapper.ts',
    );
    write(
      root,
      'modules/business/pricing/test/features/catalog/unknown/unknown.test.ts',
    );

    expect(auditRepositoryArchitecture(root, architecture)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'pricing.mapper.ts has no declared architectural role suffix',
        ),
        expect.stringContaining(
          'unknown.test.ts does not mirror a declared feature',
        ),
      ]),
    );
  });

  it('rejects declarations that own no source files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pressly-topology-empty-'));
    temporaryRoots.push(root);
    write(root, 'modules/business/pricing/src/main.ts');
    write(root, 'modules/business/pricing/src/public.ts');

    expect(auditRepositoryArchitecture(root, architecture)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'features/catalog/load-pricing is declared but owns no source files',
        ),
        expect.stringContaining(
          'foundations/language/pricing is declared but owns no source files',
        ),
      ]),
    );
  });

  it('rejects ordinary manifest dependencies that source does not use', () => {
    const root = validFixture();
    write(
      root,
      'modules/business/pricing/src/features/catalog/preview-pricing/preview-pricing.usecase.ts',
      `export const makePreviewPricing = () => 'pricing';`,
    );

    expect(auditRepositoryArchitecture(root, architecture)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'declares unused owner dependency feature:catalog/preview-pricing -> foundation:language/pricing',
        ),
      ]),
    );
  });

  it('rejects observed owner dependencies absent from the manifest', () => {
    const undeclaredArchitecture = compileArchitecture(
      defineRepository({
        name: 'undeclared-dependency-fixture',
        moduleFamilies: ['business'],
        moduleRootFiles: ['main.ts', 'public.ts'],
        packageKinds: {},
      }),
      [
        defineModule({
          id: 'business/pricing',
          packageName: '@example/pricing',
          features: defineNamespace({
            catalog: defineNamespace({
              'load-pricing': defineFeature.headlessQuery({
                dependsOn: ['language/pricing'],
              }),
              'preview-pricing': defineFeature.headlessQuery(),
            }),
          }),
          foundations: {
            language: defineNamespace({
              pricing: defineFoundation.language(),
            }),
          },
        }),
      ],
    );
    const root = validFixture();

    expect(auditRepositoryArchitecture(root, undeclaredArchitecture)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'does not declare observed owner dependency feature:catalog/preview-pricing -> foundation:language/pricing',
        ),
      ]),
    );
  });

  it('rejects multiple application use-case files in one feature leaf', () => {
    const root = validFixture();
    write(
      root,
      'modules/business/pricing/src/features/catalog/load-pricing/load-pricing-preview.usecase.ts',
    );

    expect(auditRepositoryArchitecture(root, architecture)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'features/catalog/load-pricing owns 2 *.usecase.ts files',
        ),
      ]),
    );
  });

  it('rejects a reusable foundation that has only one feature consumer', () => {
    const singleConsumerArchitecture = compileArchitecture(
      defineRepository({
        name: 'single-consumer-fixture',
        moduleFamilies: ['business'],
        moduleRootFiles: ['main.ts', 'public.ts'],
        packageKinds: {},
      }),
      [
        defineModule({
          id: 'business/pricing',
          packageName: '@example/pricing',
          features: defineNamespace({
            catalog: defineNamespace({
              load: defineFeature.headlessQuery({
                dependsOn: ['language/pricing'],
              }),
            }),
          }),
          foundations: {
            language: defineNamespace({
              pricing: defineFoundation.language(),
            }),
          },
        }),
      ],
    );
    const root = mkdtempSync(path.join(tmpdir(), 'pressly-topology-single-'));
    temporaryRoots.push(root);
    write(root, 'modules/business/pricing/src/main.ts');
    write(root, 'modules/business/pricing/src/public.ts');
    write(
      root,
      'modules/business/pricing/src/features/catalog/load/load.usecase.ts',
      `import type { Pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export const makeLoad = (): Pricing => 'pricing';`,
    );
    write(
      root,
      'modules/business/pricing/src/foundations/language/pricing/pricing.model.ts',
      'export type Pricing = string;',
    );

    expect(
      auditRepositoryArchitecture(root, singleConsumerArchitecture),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'foundations/language/pricing is declared for reuse but has 1 transitive feature consumer (catalog/load)',
        ),
      ]),
    );
  });

  it('requires a continuity foundation to own a lifecycle anchor', () => {
    const continuityArchitecture = compileArchitecture(
      defineRepository({
        name: 'continuity-fixture',
        moduleFamilies: ['business'],
        moduleRootFiles: ['main.ts', 'public.ts'],
        packageKinds: {},
      }),
      [
        defineModule({
          id: 'business/pricing',
          packageName: '@example/pricing',
          features: defineNamespace({
            catalog: defineNamespace({
              load: defineFeature.headlessQuery({
                dependsOn: ['language/pricebook'],
              }),
            }),
          }),
          foundations: {
            language: defineNamespace({
              pricebook: defineFoundation.language({ basis: 'continuity' }),
            }),
          },
        }),
      ],
    );
    const root = mkdtempSync(
      path.join(tmpdir(), 'pressly-topology-continuity-'),
    );
    temporaryRoots.push(root);
    write(root, 'modules/business/pricing/src/main.ts');
    write(root, 'modules/business/pricing/src/public.ts');
    write(
      root,
      'modules/business/pricing/src/features/catalog/load/load.usecase.ts',
      `import type { Pricebook } from '../../../foundations/language/pricebook/pricebook.model.ts'; export const makeLoad = (): Pricebook => ({ state: 'active' });`,
    );
    write(
      root,
      'modules/business/pricing/src/foundations/language/pricebook/pricebook.model.ts',
      `export type Pricebook = Readonly<{ state: 'active' }>;`,
    );

    expect(auditRepositoryArchitecture(root, continuityArchitecture)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'foundations/language/pricebook requires a *.lifecycle.ts file',
        ),
      ]),
    );

    write(
      root,
      'modules/business/pricing/src/foundations/language/pricebook/pricebook.lifecycle.ts',
    );
    expect(auditRepositoryArchitecture(root, continuityArchitecture)).toEqual(
      [],
    );
  });

  it('requires exactly one port declaration file per port foundation', () => {
    const portArchitecture = compileArchitecture(
      defineRepository({
        name: 'port-fixture',
        moduleFamilies: ['business'],
        moduleRootFiles: ['main.ts', 'public.ts'],
        packageKinds: {},
      }),
      [
        defineModule({
          id: 'business/pricing',
          packageName: '@example/pricing',
          features: defineNamespace({
            catalog: defineNamespace({
              list: defineFeature.headlessQuery({
                dependsOn: ['ports/catalog'],
              }),
              load: defineFeature.headlessQuery({
                dependsOn: ['ports/catalog'],
              }),
            }),
          }),
          foundations: {
            ports: defineNamespace({ catalog: defineFoundation.port() }),
          },
        }),
      ],
    );
    const root = mkdtempSync(path.join(tmpdir(), 'pressly-topology-port-'));
    temporaryRoots.push(root);
    write(root, 'modules/business/pricing/src/main.ts');
    write(root, 'modules/business/pricing/src/public.ts');
    write(
      root,
      'modules/business/pricing/src/features/catalog/list/list.usecase.ts',
      `import type { CatalogPort } from '../../../foundations/ports/catalog/read.port.ts'; export type List = (port: CatalogPort) => void; export const makeList = (): List => () => undefined;`,
    );
    write(
      root,
      'modules/business/pricing/src/features/catalog/load/load.usecase.ts',
      `import type { CatalogPort } from '../../../foundations/ports/catalog/read.port.ts'; export type Load = (port: CatalogPort) => void; export const makeLoad = (): Load => () => undefined;`,
    );
    write(
      root,
      'modules/business/pricing/src/foundations/ports/catalog/read.port.ts',
      'export type CatalogPort = Readonly<{ load: () => unknown; }>;',
    );
    write(
      root,
      'modules/business/pricing/src/foundations/ports/catalog/write.port.ts',
    );

    expect(auditRepositoryArchitecture(root, portArchitecture)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'foundations/ports/catalog requires exactly 1 *.port.ts file; found 2',
        ),
      ]),
    );
  });

  it('accepts a reused concrete adapter without manufacturing a shared port', () => {
    const adapterArchitecture = compileArchitecture(
      defineRepository({
        name: 'adapter-fixture',
        moduleFamilies: ['business'],
        moduleRootFiles: ['main.ts', 'public.ts'],
        packageKinds: {},
      }),
      [
        defineModule({
          id: 'business/pricing',
          packageName: '@example/pricing',
          features: defineNamespace({
            catalog: defineNamespace({
              list: defineFeature.headlessQuery({
                dependsOn: ['adapters/postgres'],
              }),
              load: defineFeature.headlessQuery({
                dependsOn: ['adapters/postgres'],
              }),
            }),
          }),
          foundations: {
            adapters: defineNamespace({
              postgres: defineFoundation.adapter(),
            }),
          },
        }),
      ],
    );
    const root = mkdtempSync(path.join(tmpdir(), 'pressly-topology-adapter-'));
    temporaryRoots.push(root);
    write(root, 'modules/business/pricing/src/main.ts');
    write(root, 'modules/business/pricing/src/public.ts');
    write(
      root,
      'modules/business/pricing/src/features/catalog/list/list.usecase.ts',
      `import type { CatalogRepository } from '../../../foundations/adapters/postgres/catalog.repo.ts'; export type List = (repository: CatalogRepository) => void; export const makeList = (): List => () => undefined;`,
    );
    write(
      root,
      'modules/business/pricing/src/features/catalog/load/load.usecase.ts',
      `import type { CatalogRepository } from '../../../foundations/adapters/postgres/catalog.repo.ts'; export type Load = (repository: CatalogRepository) => void; export const makeLoad = (): Load => () => undefined;`,
    );
    write(
      root,
      'modules/business/pricing/src/foundations/adapters/postgres/catalog.repo.ts',
      'export type CatalogRepository = Readonly<{ load: () => unknown; }>;',
    );

    expect(auditRepositoryArchitecture(root, adapterArchitecture)).toEqual([]);
  });

  it('treats adapter implementation as a semantic edge with source type proof', () => {
    const implementationArchitecture = compileArchitecture(
      defineRepository({
        name: 'implementation-fixture',
        moduleFamilies: ['business'],
        moduleRootFiles: ['main.ts', 'public.ts'],
        packageKinds: {},
      }),
      [
        defineModule({
          id: 'business/pricing',
          packageName: '@example/pricing',
          features: defineNamespace({
            catalog: defineNamespace({
              list: defineFeature.headlessQuery({
                dependsOn: ['ports/catalog'],
              }),
              load: defineFeature.headlessQuery({
                dependsOn: ['ports/catalog'],
              }),
            }),
          }),
          foundations: {
            ports: defineNamespace({ catalog: defineFoundation.port() }),
            adapters: defineNamespace({
              postgres: defineFoundation.adapter({
                implements: 'ports/catalog',
              }),
            }),
          },
        }),
      ],
    );
    const root = mkdtempSync(
      path.join(tmpdir(), 'pressly-topology-implementation-'),
    );
    temporaryRoots.push(root);
    write(root, 'modules/business/pricing/src/main.ts');
    write(root, 'modules/business/pricing/src/public.ts');
    for (const feature of ['list', 'load'])
      write(
        root,
        `modules/business/pricing/src/features/catalog/${feature}/${feature}.usecase.ts`,
        `import type { CatalogPort } from '../../../foundations/ports/catalog/catalog.port.ts'; export const make${feature === 'list' ? 'List' : 'Load'} = (port: CatalogPort) => () => port.load();`,
      );
    write(
      root,
      'modules/business/pricing/src/foundations/ports/catalog/catalog.port.ts',
      'export type CatalogPort = Readonly<{ load: () => unknown; }>;',
    );
    const repositoryPath =
      'modules/business/pricing/src/foundations/adapters/postgres/catalog.repo.ts';
    write(
      root,
      repositoryPath,
      `import type { CatalogPort } from '../../ports/catalog/catalog.port.ts'; export const makeCatalogRepository = (): CatalogPort => ({ load: () => undefined });`,
    );

    expect(
      auditRepositoryArchitecture(root, implementationArchitecture),
    ).toEqual([]);

    write(
      root,
      repositoryPath,
      `import type { CatalogPort } from '../../ports/catalog/catalog.port.ts'; export const catalogRepository: CatalogPort = { load: () => undefined };`,
    );
    expect(
      auditRepositoryArchitecture(root, implementationArchitecture),
    ).toEqual([]);

    write(
      root,
      repositoryPath,
      `import type { CatalogPort } from '../../ports/catalog/catalog.port.ts'; export const catalogRepository = { load: () => undefined } satisfies CatalogPort;`,
    );
    expect(
      auditRepositoryArchitecture(root, implementationArchitecture),
    ).toEqual([]);

    write(
      root,
      repositoryPath,
      `import type { CatalogPort } from '../../ports/catalog/catalog.port.ts'; export const bindCatalogRepository = (implementation: CatalogPort) => implementation;`,
    );
    expect(
      auditRepositoryArchitecture(root, implementationArchitecture),
    ).toEqual([]);

    write(
      root,
      repositoryPath,
      `import type { CatalogPort } from '../../ports/catalog/catalog.port.ts'; export const makeCatalogRepository = () => ({ load: () => undefined });`,
    );
    expect(
      auditRepositoryArchitecture(root, implementationArchitecture),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'declares that it implements ports/catalog but has no source-level type conformance evidence',
        ),
      ]),
    );

    write(
      root,
      repositoryPath,
      `import type { CatalogPort } from '../../ports/catalog/catalog.port.ts'; type CatalogImplementation = CatalogPort; export const catalogRepository: CatalogImplementation = { load: () => undefined };`,
    );
    expect(
      auditRepositoryArchitecture(root, implementationArchitecture),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'declares that it implements ports/catalog but has no source-level type conformance evidence',
        ),
      ]),
    );

    write(
      root,
      repositoryPath,
      `import type { CatalogPort } from '../../ports/catalog/catalog.port.ts'; export const catalogRepository = { load: () => undefined } as CatalogPort;`,
    );
    expect(
      auditRepositoryArchitecture(root, implementationArchitecture),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'declares that it implements ports/catalog but has no source-level type conformance evidence',
        ),
      ]),
    );
  });

  it('formats cohesion reports in stable module and foundation order', () => {
    const root = validFixture();
    const observedDependencies = observeRepositoryOwnerDependencies(
      root,
      architecture,
    );

    expect(
      formatFoundationCohesionReport(
        reportFoundationCohesion(architecture, observedDependencies),
      ),
    ).toBe(
      [
        'module\tfoundation\tprofile\tbasis\tstatus\timplements-port\timplementation-evidence\tdeclared-direct-consumers\tdirect-consumers\tdeclared-transitive-consumers\ttransitive-consumers',
        'business/pricing\tlanguage/pricing\tlanguage\treuse\tearned-reuse\t-\tnot-declared\tcatalog/load-pricing,catalog/preview-pricing\tcatalog/load-pricing,catalog/preview-pricing\tcatalog/load-pricing,catalog/preview-pricing\tcatalog/load-pricing,catalog/preview-pricing',
      ].join('\n'),
    );
  });
});
