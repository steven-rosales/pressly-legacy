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
import { auditRepositoryArchitecture } from '../architecture/architecture-check.ts';
import { compileArchitecture } from '../architecture/architecture-compiler.ts';

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
  );
  write(
    root,
    `${moduleRoot}/src/foundations/language/pricing/pricing.model.ts`,
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
});
