import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toolingError } from '@pressly/errors/tooling-error';
import type {
  ModuleDefinition,
  RepositoryDefinition,
} from './architecture-definition.factory.ts';
import {
  compileArchitecture,
  type RepositoryArchitecture,
} from './architecture-compiler.ts';

export const presslyRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export type ArchitectureDefinitionLoader = (
  manifestPath: string,
) => Promise<unknown>;

export type DiscoverArchitectureOptions = Readonly<{
  repositoryRoot?: string;
  repository: RepositoryDefinition;
  loadDefinition?: ArchitectureDefinitionLoader;
}>;

const defaultDefinitionLoader: ArchitectureDefinitionLoader = async (
  manifestPath,
) => import(pathToFileURL(manifestPath).href);

const isModuleDefinition = (value: unknown): value is ModuleDefinition => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Readonly<Record<string, unknown>>;

  return (
    candidate['layout'] === 'feature-foundation-v2' &&
    typeof candidate['id'] === 'string' &&
    typeof candidate['packageName'] === 'string'
  );
};

const definitionFromLoadedModule = (
  loaded: unknown,
): ModuleDefinition | null => {
  if (isModuleDefinition(loaded)) return loaded;
  if (typeof loaded !== 'object' || loaded === null) return null;

  const record = loaded as Readonly<Record<string, unknown>>;
  const candidate = record['default'] ?? record['moduleArchitecture'];
  return isModuleDefinition(candidate) ? candidate : null;
};

const readPackageName = (manifestPath: string): string | null => {
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) return null;
  const name = (parsed as Readonly<Record<string, unknown>>)['name'];
  return typeof name === 'string' ? name : null;
};

const moduleDirectories = (repositoryRoot: string): readonly string[] => {
  const modulesRoot = path.join(repositoryRoot, 'modules');
  if (!existsSync(modulesRoot)) return Object.freeze([]);

  return Object.freeze(
    readdirSync(modulesRoot, { withFileTypes: true })
      .filter((family) => family.isDirectory())
      .flatMap((family) => {
        const familyRoot = path.join(modulesRoot, family.name);
        return readdirSync(familyRoot, { withFileTypes: true })
          .filter((module) => module.isDirectory())
          .map((module) => path.join(familyRoot, module.name));
      })
      .sort(),
  );
};

/**
 * Loads one declarative architecture manifest per workspace module, validates
 * it against the package path, then compiles the immutable repository graph.
 * The default root is derived from this file, never from process.cwd().
 */
export const discoverArchitecture = async ({
  repositoryRoot = presslyRepositoryRoot,
  repository,
  loadDefinition = defaultDefinitionLoader,
}: DiscoverArchitectureOptions): Promise<RepositoryArchitecture> => {
  const errors: string[] = [];
  const definitions: ModuleDefinition[] = [];

  for (const moduleRoot of moduleDirectories(repositoryRoot)) {
    const packageManifestPath = path.join(moduleRoot, 'package.json');
    const architectureManifestPath = path.join(
      moduleRoot,
      'module.architecture.ts',
    );
    const relativeModuleRoot = path
      .relative(path.join(repositoryRoot, 'modules'), moduleRoot)
      .replaceAll(path.sep, '/');

    if (!existsSync(packageManifestPath)) {
      if (existsSync(architectureManifestPath))
        errors.push(
          `Architecture manifest "modules/${relativeModuleRoot}/module.architecture.ts" has no package.json owner.`,
        );
      continue;
    }

    if (!existsSync(architectureManifestPath)) {
      errors.push(
        `Module "${relativeModuleRoot}" is missing module.architecture.ts.`,
      );
      continue;
    }

    let loaded: unknown;
    try {
      loaded = await loadDefinition(architectureManifestPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      errors.push(
        `Could not load "modules/${relativeModuleRoot}/module.architecture.ts": ${detail}`,
      );
      continue;
    }

    const definition = definitionFromLoadedModule(loaded);
    if (definition === null) {
      errors.push(
        `Architecture manifest "modules/${relativeModuleRoot}/module.architecture.ts" must default-export defineModule(...).`,
      );
      continue;
    }

    const packageName = readPackageName(packageManifestPath);
    if (definition.id !== relativeModuleRoot)
      errors.push(
        `Architecture id "${definition.id}" does not match module path "${relativeModuleRoot}".`,
      );
    if (packageName === null)
      errors.push(`Module "${relativeModuleRoot}" package.json has no name.`);
    else if (definition.packageName !== packageName)
      errors.push(
        `Architecture package "${definition.packageName}" does not match package.json name "${packageName}" for "${relativeModuleRoot}".`,
      );

    definitions.push(definition);
  }

  if (errors.length > 0)
    throw toolingError({
      code: 'invalid_architecture_discovery',
      message: `Invalid architecture discovery:\n${errors
        .map((error) => `- ${error}`)
        .join('\n')}`,
      nativeKind: 'TypeError',
    });

  return compileArchitecture(repository, definitions);
};
