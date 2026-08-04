import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  roleForFileName,
  type CompiledV2Module,
  type RepositoryArchitecture,
} from './architecture-compiler.ts';
import { presslyRepositoryRoot } from './architecture-discovery.ts';
import { presslyModuleArchitecture } from './pressly-module-architecture.ts';

const directoriesIn = (directory: string): readonly string[] =>
  existsSync(directory)
    ? Object.freeze(
        readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort(),
      )
    : Object.freeze([]);

const filesIn = (directory: string): readonly string[] =>
  existsSync(directory)
    ? Object.freeze(
        readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .sort(),
      )
    : Object.freeze([]);

const readFiles = (directory: string): readonly string[] => {
  if (!existsSync(directory)) return Object.freeze([]);

  return Object.freeze(
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? readFiles(entryPath) : [entryPath];
    }),
  );
};

const displayPath = (repositoryRoot: string, filePath: string): string =>
  path.relative(repositoryRoot, filePath).replaceAll(path.sep, '/');

const matchingOwner = (
  relativePath: string,
  owners: readonly string[],
): string | null =>
  [...owners]
    .sort((left, right) => right.length - left.length)
    .find(
      (owner) => relativePath === owner || relativePath.startsWith(`${owner}/`),
    ) ?? null;

const auditV2Leaf = (
  repositoryRoot: string,
  leafRoot: string,
  owner: Readonly<{
    allowedRoles: ReadonlySet<string>;
    requiredRoles?: readonly string[];
    requiredAnyRole?: readonly string[];
  }>,
): readonly string[] => {
  const violations: string[] = [];
  const files = readFiles(leafRoot);
  const displayRoot = displayPath(repositoryRoot, leafRoot);

  if (files.length === 0)
    return Object.freeze([
      `${displayRoot} is declared but owns no source files. Remove the declaration or implement the owner.`,
    ]);

  const roles = new Set<string>();
  let usecaseCount = 0;
  for (const filePath of files) {
    if (!filePath.endsWith('.ts')) {
      violations.push(
        `${displayPath(repositoryRoot, filePath)} must use the .ts extension.`,
      );
      continue;
    }

    const role = roleForFileName(path.basename(filePath));
    if (role === null) {
      violations.push(
        `${displayPath(repositoryRoot, filePath)} has no declared architectural role suffix.`,
      );
      continue;
    }

    roles.add(role);
    if (role === 'usecase') usecaseCount += 1;
    if (!owner.allowedRoles.has(role))
      violations.push(
        `${displayPath(repositoryRoot, filePath)} uses role "${role}" outside its owner profile.`,
      );
  }

  if (usecaseCount > 1)
    violations.push(
      `${displayRoot} owns ${usecaseCount} *.usecase.ts files; a feature leaf may own at most one application use-case file. Split independently named operations into sibling features.`,
    );

  for (const requiredRole of owner.requiredRoles ?? [])
    if (!roles.has(requiredRole))
      violations.push(`${displayRoot} requires a *.${requiredRole}.ts file.`);

  const requiredAnyRole = owner.requiredAnyRole ?? [];
  if (
    requiredAnyRole.length > 0 &&
    !requiredAnyRole.some((role) => roles.has(role))
  )
    violations.push(
      `${displayRoot} requires at least one of: ${requiredAnyRole
        .map((role) => `*.${role}.ts`)
        .join(', ')}.`,
    );

  return Object.freeze(violations);
};

const auditV2Tests = (
  repositoryRoot: string,
  moduleRoot: string,
  module: CompiledV2Module,
): readonly string[] => {
  const testRoot = path.join(moduleRoot, 'test');
  if (!existsSync(testRoot)) return Object.freeze([]);

  const violations: string[] = [];
  const allowedZones = new Set([
    'features',
    'foundations',
    'integration',
    'support',
  ]);
  for (const zone of directoriesIn(testRoot))
    if (!allowedZones.has(zone))
      violations.push(
        `${displayPath(repositoryRoot, path.join(testRoot, zone))} is not a mirrored feature, foundation, integration, or support test zone.`,
      );

  for (const filePath of readFiles(testRoot)) {
    const relative = path
      .relative(testRoot, filePath)
      .replaceAll(path.sep, '/');
    if (relative.startsWith('integration/') || relative.startsWith('support/'))
      continue;

    if (relative.startsWith('features/')) {
      const owner = matchingOwner(relative.slice('features/'.length), [
        ...module.features.keys(),
      ]);
      if (owner === null)
        violations.push(
          `${displayPath(repositoryRoot, filePath)} does not mirror a declared feature.`,
        );
      continue;
    }

    if (relative.startsWith('foundations/')) {
      const owner = matchingOwner(relative.slice('foundations/'.length), [
        ...module.foundations.keys(),
      ]);
      if (owner === null)
        violations.push(
          `${displayPath(repositoryRoot, filePath)} does not mirror a declared foundation.`,
        );
      continue;
    }

    violations.push(
      `${displayPath(repositoryRoot, filePath)} must live under test/features, test/foundations, test/integration, or test/support.`,
    );
  }

  return Object.freeze(violations);
};

const auditV2Module = (
  repositoryRoot: string,
  moduleRoot: string,
  module: CompiledV2Module,
  rootFiles: readonly string[],
): readonly string[] => {
  const violations: string[] = [];
  const sourceRoot = path.join(moduleRoot, 'src');
  const actualRootFiles = filesIn(sourceRoot);
  const rootDelta = {
    missing: rootFiles.filter((file) => !actualRootFiles.includes(file)),
    unexpected: actualRootFiles.filter((file) => !rootFiles.includes(file)),
  };

  for (const file of rootDelta.missing)
    violations.push(
      `${displayPath(repositoryRoot, sourceRoot)} is missing ${file}.`,
    );
  for (const file of rootDelta.unexpected)
    violations.push(
      `${displayPath(repositoryRoot, path.join(sourceRoot, file))} is not an allowed module root file.`,
    );

  const allowedSourceZones = new Set([
    'features',
    'foundations',
    'composition',
  ]);
  for (const directory of directoriesIn(sourceRoot))
    if (!allowedSourceZones.has(directory))
      violations.push(
        `${displayPath(repositoryRoot, path.join(sourceRoot, directory))} is not a v2 source zone.`,
      );

  for (const feature of module.features.values())
    violations.push(
      ...auditV2Leaf(
        repositoryRoot,
        path.join(sourceRoot, 'features', feature.path),
        {
          allowedRoles: feature.allowedRoles,
          requiredRoles: feature.requiredRoles,
        },
      ),
    );

  for (const foundation of module.foundations.values())
    violations.push(
      ...auditV2Leaf(
        repositoryRoot,
        path.join(sourceRoot, 'foundations', foundation.path),
        {
          allowedRoles: foundation.allowedRoles,
          requiredAnyRole: foundation.requiredAnyRole,
        },
      ),
    );

  const compositionRoot = path.join(sourceRoot, 'composition');
  for (const filePath of readFiles(compositionRoot))
    if (roleForFileName(path.basename(filePath)) !== 'composition')
      violations.push(
        `${displayPath(repositoryRoot, filePath)} must use the *.composition.ts role inside composition.`,
      );

  violations.push(...auditV2Tests(repositoryRoot, moduleRoot, module));
  return Object.freeze(violations);
};

export const auditRepositoryArchitecture = (
  repositoryRoot: string,
  architecture: RepositoryArchitecture,
): readonly string[] => {
  const violations: string[] = [];

  for (const module of architecture.modules.values()) {
    const moduleRoot = path.join(repositoryRoot, 'modules', module.id);
    violations.push(
      ...auditV2Module(
        repositoryRoot,
        moduleRoot,
        module,
        architecture.rootFiles,
      ),
    );
  }

  return Object.freeze(violations.sort());
};

export const runArchitectureCheck = (): readonly string[] =>
  auditRepositoryArchitecture(presslyRepositoryRoot, presslyModuleArchitecture);

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  path.resolve(invokedPath) === fileURLToPath(import.meta.url)
) {
  const violations = runArchitectureCheck();
  if (violations.length > 0) {
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  }
}
