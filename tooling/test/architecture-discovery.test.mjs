import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defineFeature,
  defineModule,
  defineNamespace,
  defineRepository,
} from '../architecture/architecture-definition.factory.ts';
import {
  discoverArchitecture,
  presslyRepositoryRoot,
} from '../architecture/architecture-discovery.ts';
import { presslyRepositoryArchitecture } from '../architecture/pressly-repository.architecture.ts';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { force: true, recursive: true });
});

const makeFixtureRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pressly-architecture-'));
  temporaryRoots.push(root);
  const moduleRoot = path.join(root, 'modules/business/example');
  mkdirSync(moduleRoot, { recursive: true });
  writeFileSync(
    path.join(moduleRoot, 'package.json'),
    JSON.stringify({ name: '@example/module' }),
  );
  writeFileSync(path.join(moduleRoot, 'module.architecture.ts'), 'export {};');
  return root;
};

const fixtureRepository = defineRepository({
  name: 'fixture',
  moduleFamilies: ['business'],
  moduleRootFiles: ['main.ts', 'public.ts'],
  packageKinds: {},
});

const fixtureDefinition = defineModule({
  id: 'business/example',
  packageName: '@example/module',
  features: defineNamespace({
    catalog: defineNamespace({
      'load-example': defineFeature.headlessQuery(),
    }),
  }),
});

describe.sequential('architecture discovery', () => {
  it('auto-discovers every real module manifest and package identity', async () => {
    const architecture = await discoverArchitecture({
      repository: presslyRepositoryArchitecture,
    });

    expect(architecture.moduleKeys).toContain('business/pricing');
    expect(architecture.modulePackageNames).toContain('@pressly/pricing');
    expect(architecture.moduleKeys).toHaveLength(
      architecture.modulePackageNames.length,
    );
  });

  it('anchors default discovery to import.meta.url under a package-local cwd', async () => {
    const originalCwd = process.cwd();
    process.chdir(path.join(presslyRepositoryRoot, 'modules/business/pricing'));

    try {
      const architecture = await discoverArchitecture({
        repository: presslyRepositoryArchitecture,
      });
      expect(architecture.moduleKeys).toContain('business/orders');
      expect(architecture.modulePackageNames).toContain('@pressly/orders');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('loads one definition per package without a central module inventory', async () => {
    const repositoryRoot = makeFixtureRoot();
    const architecture = await discoverArchitecture({
      repositoryRoot,
      repository: fixtureRepository,
      loadDefinition: async () => ({ default: fixtureDefinition }),
    });

    expect(architecture.moduleKeys).toEqual(['business/example']);
    expect(architecture.modulePackageNames).toEqual(['@example/module']);
  });

  it('fails when a discovered definition disagrees with its package path', async () => {
    const repositoryRoot = makeFixtureRoot();
    const mismatched = defineModule({
      ...fixtureDefinition,
      id: 'business/not-example',
    });

    await expect(
      discoverArchitecture({
        repositoryRoot,
        repository: fixtureRepository,
        loadDefinition: async () => ({ default: mismatched }),
      }),
    ).rejects.toThrow(/does not match module path "business\/example"/);
  });
});
