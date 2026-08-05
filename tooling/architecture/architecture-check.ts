import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  architectureOwnerDependencyKey,
  declaredOwnerDependencies,
  hasImplementationBindingEvidence,
  implementationOwnerDependencies,
  reportFoundationCohesion,
  roleForFileName,
  type FoundationCohesion,
  type CompiledV2Module,
  type RepositoryArchitecture,
} from './architecture-compiler.ts';
import { presslyRepositoryRoot } from './architecture-discovery.ts';
import { presslyModuleArchitecture } from './pressly-module-architecture.ts';
import {
  observeRepositoryOwnerDependencies,
  type ObservedArchitectureOwnerDependency,
} from './architecture-source-graph.ts';

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
    exactRoleCounts?: Readonly<Partial<Record<string, number>>>;
  }>,
): readonly string[] => {
  const violations: string[] = [];
  const files = readFiles(leafRoot);
  const displayRoot = displayPath(repositoryRoot, leafRoot);

  if (files.length === 0)
    return Object.freeze([
      `${displayRoot} is declared but owns no source files. Remove the declaration or implement the owner.`,
    ]);

  const roleCounts = new Map<string, number>();
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

    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
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
    if (!roleCounts.has(requiredRole))
      violations.push(`${displayRoot} requires a *.${requiredRole}.ts file.`);

  const requiredAnyRole = owner.requiredAnyRole ?? [];
  if (
    requiredAnyRole.length > 0 &&
    !requiredAnyRole.some((role) => roleCounts.has(role))
  )
    violations.push(
      `${displayRoot} requires at least one of: ${requiredAnyRole
        .map((role) => `*.${role}.ts`)
        .join(', ')}.`,
    );

  for (const [role, expectedCount] of Object.entries(
    owner.exactRoleCounts ?? {},
  )) {
    const actualCount = roleCounts.get(role) ?? 0;
    if (actualCount !== expectedCount)
      violations.push(
        `${displayRoot} requires exactly ${expectedCount} *.${role}.ts file${expectedCount === 1 ? '' : 's'}; found ${actualCount}.`,
      );
  }

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
          ...(foundation.profile === 'port'
            ? { exactRoleCounts: { port: 1 } }
            : { requiredAnyRole: foundation.requiredAnyRole }),
          ...(foundation.basis === 'continuity'
            ? { requiredRoles: ['lifecycle'] }
            : {}),
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

export const auditOwnerDependencyExactness = (
  architecture: RepositoryArchitecture,
  observedDependencies: readonly ObservedArchitectureOwnerDependency[],
): readonly string[] => {
  const violations: string[] = [];
  const declaredDependencies = declaredOwnerDependencies(architecture);
  const implementationDependencies =
    implementationOwnerDependencies(architecture);
  const observedByKey = new Map(
    observedDependencies.map((dependency) => [
      architectureOwnerDependencyKey(dependency),
      dependency,
    ]),
  );
  const allowedKeys = new Set([
    ...declaredDependencies.map(architectureOwnerDependencyKey),
    ...implementationDependencies.map(architectureOwnerDependencyKey),
  ]);

  for (const dependency of observedDependencies) {
    const key = architectureOwnerDependencyKey(dependency);
    if (allowedKeys.has(key)) continue;
    const evidence = dependency.evidence[0];
    const evidenceSuffix =
      evidence === undefined
        ? ''
        : ` First observed at ${evidence.file} as a ${evidence.kind} dependency on "${evidence.specifier}".`;
    violations.push(
      `modules/${dependency.moduleId}/module.architecture.ts does not declare observed owner dependency ${dependency.sourceZone}:${dependency.sourceOwner} -> ${dependency.targetZone}:${dependency.targetOwner}.${evidenceSuffix}`,
    );
  }

  for (const dependency of declaredDependencies) {
    const key = architectureOwnerDependencyKey(dependency);
    if (observedByKey.has(key)) continue;
    violations.push(
      `modules/${dependency.moduleId}/module.architecture.ts declares unused owner dependency ${dependency.sourceZone}:${dependency.sourceOwner} -> ${dependency.targetZone}:${dependency.targetOwner}. Remove the declaration unless source in that owner genuinely imports the target.`,
    );
  }

  for (const dependency of implementationDependencies) {
    const key = architectureOwnerDependencyKey(dependency);
    if (hasImplementationBindingEvidence(observedByKey.get(key))) continue;
    violations.push(
      `modules/${dependency.moduleId}/src/foundations/${dependency.sourceOwner} declares that it implements ${dependency.targetOwner} but has no source-level type conformance evidence. Bind the imported port type directly in an implementation variable, property, function signature, class implements clause, or satisfies expression; otherwise remove the implements declaration.`,
    );
  }

  return Object.freeze(violations.sort());
};

export const auditRepositoryArchitecture = (
  repositoryRoot: string,
  architecture: RepositoryArchitecture,
  observedDependencies: readonly ObservedArchitectureOwnerDependency[] = observeRepositoryOwnerDependencies(
    repositoryRoot,
    architecture,
  ),
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

  violations.push(
    ...auditOwnerDependencyExactness(architecture, observedDependencies),
  );

  for (const foundation of reportFoundationCohesion(
    architecture,
    observedDependencies,
  ))
    if (foundation.status === 'unearned-reuse') {
      const consumerKind =
        foundation.profile === 'port' ? 'direct' : 'transitive';
      const consumers =
        consumerKind === 'direct'
          ? foundation.directConsumers
          : foundation.transitiveConsumers;
      const adapterImplementation =
        foundation.implementsPort === null
          ? ''
          : ` Its implemented port is ${foundation.implementsPort}.`;
      violations.push(
        `modules/${foundation.moduleId}/src/foundations/${foundation.path} is declared for reuse but has ${consumers.length} ${consumerKind} feature consumer${consumers.length === 1 ? '' : 's'} (${consumers.join(', ') || 'none'}). Move single-consumer behavior into its feature leaf; foundations require earned sharing.${adapterImplementation}`,
      );
    }

  return Object.freeze(violations.sort());
};

export const formatFoundationCohesionReport = (
  foundations: readonly FoundationCohesion[],
): string =>
  [
    [
      'module',
      'foundation',
      'profile',
      'basis',
      'status',
      'implements-port',
      'implementation-evidence',
      'declared-direct-consumers',
      'direct-consumers',
      'declared-transitive-consumers',
      'transitive-consumers',
    ].join('\t'),
    ...foundations.map((foundation) =>
      [
        foundation.moduleId,
        foundation.path,
        foundation.profile,
        foundation.basis,
        foundation.status,
        foundation.implementsPort ?? '-',
        foundation.implementationEvidence,
        foundation.declaredDirectConsumers.join(',') || '-',
        foundation.directConsumers.join(',') || '-',
        foundation.declaredTransitiveConsumers.join(',') || '-',
        foundation.transitiveConsumers.join(',') || '-',
      ].join('\t'),
    ),
  ].join('\n');

export const runArchitectureCheck = (): readonly string[] =>
  auditRepositoryArchitecture(presslyRepositoryRoot, presslyModuleArchitecture);

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  path.resolve(invokedPath) === fileURLToPath(import.meta.url)
) {
  const observedDependencies = observeRepositoryOwnerDependencies(
    presslyRepositoryRoot,
    presslyModuleArchitecture,
  );
  if (process.argv.includes('--report-cohesion'))
    console.log(
      formatFoundationCohesionReport(
        reportFoundationCohesion(
          presslyModuleArchitecture,
          observedDependencies,
        ),
      ),
    );

  const violations = auditRepositoryArchitecture(
    presslyRepositoryRoot,
    presslyModuleArchitecture,
    observedDependencies,
  );
  if (violations.length > 0) {
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  }
}
