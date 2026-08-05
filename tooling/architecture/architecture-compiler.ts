import {
  architectureRoles,
  featureProfiles,
  foundationProfiles,
  type ArchitectureRole,
  type ArchitectureTreeNode,
  type FeatureDefinition,
  type FeatureProfileName,
  type FoundationBasis,
  type FoundationCategory,
  type FoundationDefinition,
  type FoundationProfileName,
  type ModuleDefinition,
  type NamespaceDefinition,
  type RepositoryDefinition,
} from './architecture-definition.factory.ts';
import { toolingError } from '@pressly/errors/tooling-error';

export type ArchitectureDelta<Value extends string = string> = Readonly<{
  missing: readonly Value[];
  unexpected: readonly string[];
}>;

export type CompiledFeature = Readonly<{
  path: string;
  profile: FeatureProfileName;
  dependencies: ReadonlySet<string>;
  allowedRoles: ReadonlySet<ArchitectureRole>;
  requiredRoles: readonly ArchitectureRole[];
}>;

export type CompiledFoundation = Readonly<{
  path: string;
  profile: FoundationProfileName;
  basis: FoundationBasis;
  implementsPort: string | null;
  ordinaryDependencies: ReadonlySet<string>;
  dependencies: ReadonlySet<string>;
  declaredDirectConsumers: readonly string[];
  declaredTransitiveConsumers: readonly string[];
  allowedRoles: ReadonlySet<ArchitectureRole>;
  requiredAnyRole: readonly ArchitectureRole[];
}>;

export type ArchitectureOwnerZone = 'feature' | 'foundation';

export type ArchitectureOwnerDependency = Readonly<{
  moduleId: string;
  sourceZone: ArchitectureOwnerZone;
  sourceOwner: string;
  targetZone: ArchitectureOwnerZone;
  targetOwner: string;
}>;

export type ArchitectureImplementationBinding =
  | 'class-implements'
  | 'function-parameter'
  | 'function-return'
  | 'property-annotation'
  | 'satisfies'
  | 'variable-annotation';

export type ArchitectureDependencyEvidence = Readonly<{
  kind: 'runtime' | 'type';
  implementationBindings: readonly ArchitectureImplementationBinding[];
}>;

export type ArchitectureOwnerDependencyObservation<
  Evidence extends ArchitectureDependencyEvidence =
    ArchitectureDependencyEvidence,
> = ArchitectureOwnerDependency & Readonly<{ evidence: readonly Evidence[] }>;

export const hasImplementationBindingEvidence = (
  dependency: ArchitectureOwnerDependencyObservation | undefined,
): boolean =>
  dependency?.evidence.some(
    (evidence) =>
      evidence.kind === 'type' && evidence.implementationBindings.length > 0,
  ) === true;

export type FoundationCohesionStatus =
  | 'earned-reuse'
  | 'declared-continuity'
  | 'unearned-reuse';

export type FoundationCohesion = Readonly<{
  moduleId: string;
  path: string;
  profile: FoundationProfileName;
  basis: FoundationBasis;
  implementsPort: string | null;
  implementationEvidence: 'not-declared' | 'observed' | 'missing';
  declaredDirectConsumers: readonly string[];
  declaredTransitiveConsumers: readonly string[];
  directConsumers: readonly string[];
  transitiveConsumers: readonly string[];
  status: FoundationCohesionStatus;
}>;

export type CompiledV2Module = Readonly<{
  layout: 'feature-foundation-v2';
  id: string;
  family: string;
  name: string;
  packageName: string;
  features: ReadonlyMap<string, CompiledFeature>;
  foundations: ReadonlyMap<string, CompiledFoundation>;
}>;

export type SourceLocation =
  | Readonly<{ zone: 'root'; file: 'main.ts' | 'public.ts' }>
  | Readonly<{ zone: 'composition'; role: ArchitectureRole | null }>
  | Readonly<{
      zone: 'feature';
      owner: string;
      role: ArchitectureRole | null;
    }>
  | Readonly<{
      zone: 'foundation';
      owner: string;
      role: ArchitectureRole | null;
    }>
  | Readonly<{ zone: 'unknown' }>;

export type SourceDependencyDecision =
  | Readonly<{
      allowed: true;
      reason:
        | 'same_owner'
        | 'declared_feature_foundation'
        | 'declared_foundation_dependency'
        | 'composition_root'
        | 'module_composition_surface'
        | 'public_surface';
    }>
  | Readonly<{
      allowed: false;
      reason:
        | 'unknown_source'
        | 'unknown_target'
        | 'sibling_feature'
        | 'undeclared_feature_foundation'
        | 'undeclared_foundation_dependency'
        | 'foundation_to_feature'
        | 'inward_to_composition'
        | 'invalid_root_dependency';
    }>;

export type RepositoryArchitecture = Readonly<{
  name: string;
  rootFiles: readonly string[];
  groupNames: readonly string[];
  moduleKeys: readonly string[];
  modulePackageNames: readonly string[];
  symbolSurfaces: readonly string[];
  modules: ReadonlyMap<string, CompiledV2Module>;
  rootFileDelta: (actualFiles: readonly string[]) => ArchitectureDelta;
  moduleKeyDelta: (actualModuleKeys: readonly string[]) => ArchitectureDelta;
  classifySource: (
    moduleKey: string,
    relativeFilePath: string,
  ) => SourceLocation;
  evaluateSourceDependency: (input: {
    moduleKey: string;
    sourceRelativePath: string;
    targetRelativePath: string;
  }) => SourceDependencyDecision;
}>;

const identifierPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const roleSuffixes = Object.freeze(
  [...architectureRoles].sort((left, right) => right.length - left.length),
);

const normalized = (value: string): string =>
  value.replaceAll('\\', '/').replace(/^\.\//, '');

export const architectureOwnerDependencyKey = (
  dependency: ArchitectureOwnerDependency,
): string =>
  [
    dependency.moduleId,
    `${dependency.sourceZone}:${dependency.sourceOwner}`,
    `${dependency.targetZone}:${dependency.targetOwner}`,
  ].join('|');

const duplicateValues = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }

  return Object.freeze([...duplicates].sort());
};

const invalidPathSegments = (value: string): readonly string[] =>
  Object.freeze(
    value.split('/').filter((segment) => !identifierPattern.test(segment)),
  );

const delta = <Value extends string>(
  expected: readonly Value[],
  actual: readonly string[],
): ArchitectureDelta<Value> => {
  const expectedValues = new Set<string>(expected);
  const actualValues = new Set(actual);

  return Object.freeze({
    missing: Object.freeze(
      expected.filter((value) => !actualValues.has(value)),
    ),
    unexpected: Object.freeze(
      [...actualValues].filter((value) => !expectedValues.has(value)).sort(),
    ),
  });
};

const splitModuleId = (
  id: string,
): Readonly<{ family: string; name: string }> | null => {
  const segments = id.split('/');
  const family = segments[0];
  const name = segments[1];

  return segments.length === 2 && family !== undefined && name !== undefined
    ? Object.freeze({ family, name })
    : null;
};

const walkNamespace = <Leaf extends FeatureDefinition | FoundationDefinition>(
  namespace: NamespaceDefinition,
  accepts: (node: ArchitectureTreeNode) => node is Leaf,
  prefix: readonly string[] = [],
): Readonly<{
  leaves: readonly Readonly<{ path: string; definition: Leaf }>[];
  errors: readonly string[];
}> => {
  const leaves: Readonly<{ path: string; definition: Leaf }>[] = [];
  const errors: string[] = [];
  const entries = Object.entries(namespace.children);

  if (entries.length === 0)
    errors.push(
      `Namespace "${prefix.join('/') || '<root>'}" must not be empty.`,
    );

  for (const [name, node] of entries) {
    const path = [...prefix, name];

    if (!identifierPattern.test(name))
      errors.push(`Invalid architecture path segment "${name}".`);

    if (node.node === 'namespace') {
      const nested = walkNamespace(node, accepts, path);
      leaves.push(...nested.leaves);
      errors.push(...nested.errors);
      continue;
    }

    if (!accepts(node)) {
      errors.push(`Unexpected ${node.node} at "${path.join('/')}".`);
      continue;
    }

    leaves.push(Object.freeze({ path: path.join('/'), definition: node }));
  }

  return Object.freeze({
    leaves: Object.freeze(leaves),
    errors: Object.freeze(errors),
  });
};

const dependencyCycles = (
  dependencies: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[] => {
  const visited = new Set<string>();
  const active = new Set<string>();
  const path: string[] = [];
  const cycles = new Set<string>();

  const visit = (node: string): void => {
    if (active.has(node)) {
      const start = path.indexOf(node);
      cycles.add([...path.slice(start), node].join(' -> '));
      return;
    }

    if (visited.has(node)) return;

    active.add(node);
    path.push(node);

    for (const dependency of dependencies.get(node) ?? [])
      if (dependencies.has(dependency)) visit(dependency);

    path.pop();
    active.delete(node);
    visited.add(node);
  };

  for (const node of dependencies.keys()) visit(node);

  return Object.freeze([...cycles].sort());
};

const expectedFoundationProfile: Readonly<
  Record<FoundationCategory, FoundationProfileName>
> = Object.freeze({
  language: 'language',
  algorithms: 'algorithm',
  ports: 'port',
  adapters: 'adapter',
});

const featureConsumersByFoundation = (
  features: ReadonlyMap<
    string,
    Readonly<{ path: string; dependencies: ReadonlySet<string> }>
  >,
  foundations: ReadonlyMap<
    string,
    Readonly<{ dependencies: ReadonlySet<string> }>
  >,
): ReadonlyMap<
  string,
  Readonly<{
    direct: readonly string[];
    transitive: readonly string[];
  }>
> => {
  const consumers = new Map<
    string,
    { direct: Set<string>; transitive: Set<string> }
  >(
    [...foundations.keys()].map((path) => [
      path,
      { direct: new Set<string>(), transitive: new Set<string>() },
    ]),
  );

  const visitDependencies = (
    featurePath: string,
    foundationPath: string,
    visited: Set<string>,
  ): void => {
    if (visited.has(foundationPath)) return;
    visited.add(foundationPath);

    consumers.get(foundationPath)?.transitive.add(featurePath);
    for (const dependency of foundations.get(foundationPath)?.dependencies ??
      [])
      visitDependencies(featurePath, dependency, visited);
  };

  for (const feature of features.values())
    for (const dependency of feature.dependencies) {
      consumers.get(dependency)?.direct.add(feature.path);
      visitDependencies(feature.path, dependency, new Set<string>());
    }

  return new Map(
    [...consumers].map(([path, value]) => [
      path,
      Object.freeze({
        direct: Object.freeze([...value.direct].sort()),
        transitive: Object.freeze([...value.transitive].sort()),
      }),
    ]),
  );
};

const flattenV2Module = (
  definition: ModuleDefinition,
): Readonly<{
  features: ReadonlyMap<string, CompiledFeature>;
  foundations: ReadonlyMap<string, CompiledFoundation>;
  errors: readonly string[];
}> => {
  const errors: string[] = [];
  const featureWalk = walkNamespace(
    definition.features,
    (node): node is FeatureDefinition => node.node === 'feature',
  );
  errors.push(...featureWalk.errors);

  const foundationLeaves: Readonly<{
    category: FoundationCategory;
    path: string;
    definition: FoundationDefinition;
  }>[] = [];

  for (const [category, namespace] of Object.entries(
    definition.foundations ?? {},
  ) as readonly [FoundationCategory, NamespaceDefinition][]) {
    const foundationWalk = walkNamespace(
      namespace,
      (node): node is FoundationDefinition => node.node === 'foundation',
    );
    errors.push(...foundationWalk.errors);

    for (const leaf of foundationWalk.leaves) {
      if (leaf.definition.profile !== expectedFoundationProfile[category])
        errors.push(
          `Foundation "${category}/${leaf.path}" uses profile "${leaf.definition.profile}"; expected "${expectedFoundationProfile[category]}".`,
        );

      if (
        leaf.definition.basis === 'continuity' &&
        leaf.definition.profile !== 'language'
      )
        errors.push(
          `Foundation "${category}/${leaf.path}" declares continuity, which is reserved for language foundations.`,
        );

      if (
        leaf.definition.implementsPort !== null &&
        leaf.definition.profile !== 'adapter'
      )
        errors.push(
          `Foundation "${category}/${leaf.path}" declares a port implementation but is not an adapter foundation.`,
        );

      foundationLeaves.push(
        Object.freeze({
          category,
          path: `${category}/${leaf.path}`,
          definition: leaf.definition,
        }),
      );
    }
  }

  for (const feature of featureWalk.leaves)
    if (feature.path.split('/').length < 2)
      errors.push(
        `Feature "${feature.path}" must sit below at least one named namespace.`,
      );

  const foundationPaths = new Set(
    foundationLeaves.map((foundation) => foundation.path),
  );

  const features = new Map<string, CompiledFeature>();
  for (const feature of featureWalk.leaves) {
    const duplicates = duplicateValues(feature.definition.dependsOn);
    if (duplicates.length > 0)
      errors.push(
        `Feature "${feature.path}" has duplicate dependencies: ${duplicates.join(', ')}.`,
      );

    const unknown = feature.definition.dependsOn.filter(
      (dependency) => !foundationPaths.has(dependency),
    );
    if (unknown.length > 0)
      errors.push(
        `Feature "${feature.path}" depends on undeclared foundations: ${unknown.join(', ')}.`,
      );

    const profile = featureProfiles[feature.definition.profile];
    features.set(
      feature.path,
      Object.freeze({
        path: feature.path,
        profile: feature.definition.profile,
        dependencies: new Set(feature.definition.dependsOn),
        allowedRoles: new Set(profile.allowedRoles),
        requiredRoles: profile.requiredRoles,
      }),
    );
  }

  const foundationBases = new Map<
    string,
    Omit<
      CompiledFoundation,
      'declaredDirectConsumers' | 'declaredTransitiveConsumers'
    >
  >();
  for (const foundation of foundationLeaves) {
    const duplicates = duplicateValues(foundation.definition.dependsOn);
    if (duplicates.length > 0)
      errors.push(
        `Foundation "${foundation.path}" has duplicate dependencies: ${duplicates.join(', ')}.`,
      );

    const unknown = foundation.definition.dependsOn.filter(
      (dependency) => !foundationPaths.has(dependency),
    );
    if (unknown.length > 0)
      errors.push(
        `Foundation "${foundation.path}" depends on undeclared foundations: ${unknown.join(', ')}.`,
      );

    const implementedPort = foundation.definition.implementsPort;
    if (implementedPort !== null) {
      const target = foundationLeaves.find(
        (candidate) => candidate.path === implementedPort,
      );
      if (target === undefined)
        errors.push(
          `Adapter foundation "${foundation.path}" implements undeclared port foundation "${implementedPort}".`,
        );
      else if (target.definition.profile !== 'port')
        errors.push(
          `Adapter foundation "${foundation.path}" implements "${implementedPort}", which is not a port foundation.`,
        );
    }

    const profile = foundationProfiles[foundation.definition.profile];
    const ordinaryDependencies = new Set(
      foundation.definition.dependsOn.filter(
        (dependency) => dependency !== implementedPort,
      ),
    );
    const dependencies = new Set(ordinaryDependencies);
    if (implementedPort !== null) dependencies.add(implementedPort);
    foundationBases.set(
      foundation.path,
      Object.freeze({
        path: foundation.path,
        profile: foundation.definition.profile,
        basis: foundation.definition.basis,
        implementsPort: foundation.definition.implementsPort,
        ordinaryDependencies,
        dependencies,
        allowedRoles: new Set(profile.allowedRoles),
        requiredAnyRole: profile.requiredAnyRole,
      }),
    );
  }

  const consumers = featureConsumersByFoundation(
    features,
    new Map(
      [...foundationBases].map(([path, foundation]) => [
        path,
        Object.freeze({ dependencies: foundation.ordinaryDependencies }),
      ]),
    ),
  );
  const foundations = new Map<string, CompiledFoundation>(
    [...foundationBases].map(([path, foundation]) => [
      path,
      Object.freeze({
        ...foundation,
        declaredDirectConsumers:
          consumers.get(path)?.direct ?? Object.freeze([]),
        declaredTransitiveConsumers:
          consumers.get(path)?.transitive ?? Object.freeze([]),
      }),
    ]),
  );

  const cycles = dependencyCycles(
    new Map(
      [...foundations].map(([path, foundation]) => [
        path,
        foundation.dependencies,
      ]),
    ),
  );
  for (const cycle of cycles)
    errors.push(`Module "${definition.id}" has a foundation cycle: ${cycle}.`);

  return Object.freeze({
    features,
    foundations,
    errors: Object.freeze(errors),
  });
};

const foundationEarnsReuse = (
  foundation: CompiledFoundation,
  foundations: ReadonlyMap<string, CompiledFoundation>,
  consumers: ReadonlyMap<
    string,
    Readonly<{ direct: readonly string[]; transitive: readonly string[] }>
  >,
  hasImplementationEvidence: boolean,
): boolean => {
  const foundationConsumers = consumers.get(foundation.path);
  if (foundation.profile === 'port')
    return (foundationConsumers?.direct.length ?? 0) >= 2;

  if (foundation.profile === 'adapter') {
    if ((foundationConsumers?.transitive.length ?? 0) >= 2) return true;

    const implementedPort =
      foundation.implementsPort === null
        ? undefined
        : foundations.get(foundation.implementsPort);
    return (
      hasImplementationEvidence &&
      implementedPort?.profile === 'port' &&
      (consumers.get(implementedPort.path)?.direct.length ?? 0) >= 2
    );
  }

  return (foundationConsumers?.transitive.length ?? 0) >= 2;
};

export const declaredOwnerDependencies = (
  architecture: RepositoryArchitecture,
): readonly ArchitectureOwnerDependency[] =>
  Object.freeze(
    [...architecture.modules.values()]
      .flatMap((module) => [
        ...[...module.features.values()].flatMap((feature) =>
          [...feature.dependencies].map((targetOwner) =>
            Object.freeze({
              moduleId: module.id,
              sourceZone: 'feature' as const,
              sourceOwner: feature.path,
              targetZone: 'foundation' as const,
              targetOwner,
            }),
          ),
        ),
        ...[...module.foundations.values()].flatMap((foundation) =>
          [...foundation.ordinaryDependencies].map((targetOwner) =>
            Object.freeze({
              moduleId: module.id,
              sourceZone: 'foundation' as const,
              sourceOwner: foundation.path,
              targetZone: 'foundation' as const,
              targetOwner,
            }),
          ),
        ),
      ])
      .sort((left, right) => {
        const leftKey = architectureOwnerDependencyKey(left);
        const rightKey = architectureOwnerDependencyKey(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
  );

export const implementationOwnerDependencies = (
  architecture: RepositoryArchitecture,
): readonly ArchitectureOwnerDependency[] =>
  Object.freeze(
    [...architecture.modules.values()]
      .flatMap((module) =>
        [...module.foundations.values()].flatMap((foundation) =>
          foundation.implementsPort === null
            ? []
            : [
                Object.freeze({
                  moduleId: module.id,
                  sourceZone: 'foundation' as const,
                  sourceOwner: foundation.path,
                  targetZone: 'foundation' as const,
                  targetOwner: foundation.implementsPort,
                }),
              ],
        ),
      )
      .sort((left, right) => {
        const leftKey = architectureOwnerDependencyKey(left);
        const rightKey = architectureOwnerDependencyKey(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
  );

const observedConsumersByFoundation = (
  module: CompiledV2Module,
  observedDependencies: readonly ArchitectureOwnerDependencyObservation[],
): ReadonlyMap<
  string,
  Readonly<{ direct: readonly string[]; transitive: readonly string[] }>
> => {
  const features = new Map(
    [...module.features.keys()].map((featurePath) => [
      featurePath,
      { path: featurePath, dependencies: new Set<string>() },
    ]),
  );
  const foundations = new Map(
    [...module.foundations.keys()].map((foundationPath) => [
      foundationPath,
      { dependencies: new Set<string>() },
    ]),
  );

  for (const dependency of observedDependencies) {
    if (dependency.moduleId !== module.id) continue;
    if (
      dependency.sourceZone === 'feature' &&
      dependency.targetZone === 'foundation'
    )
      features
        .get(dependency.sourceOwner)
        ?.dependencies.add(dependency.targetOwner);
    else if (
      dependency.sourceZone === 'foundation' &&
      dependency.targetZone === 'foundation'
    ) {
      const implementationTarget = module.foundations.get(
        dependency.sourceOwner,
      )?.implementsPort;
      if (
        implementationTarget === dependency.targetOwner &&
        !hasImplementationBindingEvidence(dependency)
      )
        continue;
      foundations
        .get(dependency.sourceOwner)
        ?.dependencies.add(dependency.targetOwner);
    }
  }

  return featureConsumersByFoundation(features, foundations);
};

export const reportFoundationCohesion = (
  architecture: RepositoryArchitecture,
  observedDependencies: readonly ArchitectureOwnerDependencyObservation[],
): readonly FoundationCohesion[] => {
  const observedDependenciesByKey = new Map(
    observedDependencies.map((dependency) => [
      architectureOwnerDependencyKey(dependency),
      dependency,
    ]),
  );

  return Object.freeze(
    [...architecture.modules.values()]
      .flatMap((module) => {
        const consumers = observedConsumersByFoundation(
          module,
          observedDependencies,
        );
        return [...module.foundations.values()].map((foundation) => {
          const observedConsumers = consumers.get(foundation.path);
          const implementationDependency =
            foundation.implementsPort === null
              ? null
              : architectureOwnerDependencyKey({
                  moduleId: module.id,
                  sourceZone: 'foundation',
                  sourceOwner: foundation.path,
                  targetZone: 'foundation',
                  targetOwner: foundation.implementsPort,
                });
          const hasImplementationEvidence =
            implementationDependency !== null &&
            hasImplementationBindingEvidence(
              observedDependenciesByKey.get(implementationDependency),
            );

          return Object.freeze({
            moduleId: module.id,
            path: foundation.path,
            profile: foundation.profile,
            basis: foundation.basis,
            implementsPort: foundation.implementsPort,
            implementationEvidence:
              implementationDependency === null
                ? ('not-declared' as const)
                : hasImplementationEvidence
                  ? ('observed' as const)
                  : ('missing' as const),
            declaredDirectConsumers: foundation.declaredDirectConsumers,
            declaredTransitiveConsumers: foundation.declaredTransitiveConsumers,
            directConsumers: observedConsumers?.direct ?? Object.freeze([]),
            transitiveConsumers:
              observedConsumers?.transitive ?? Object.freeze([]),
            status:
              foundation.basis === 'continuity'
                ? ('declared-continuity' as const)
                : foundationEarnsReuse(
                      foundation,
                      module.foundations,
                      consumers,
                      hasImplementationEvidence,
                    )
                  ? ('earned-reuse' as const)
                  : ('unearned-reuse' as const),
          });
        });
      })
      .sort((left, right) => {
        const leftPath = `${left.moduleId}/${left.path}`;
        const rightPath = `${right.moduleId}/${right.path}`;
        return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
      }),
  );
};

export const validateArchitecture = (
  repository: RepositoryDefinition,
  moduleDefinitions: readonly ModuleDefinition[],
): readonly string[] => {
  const errors: string[] = [];
  const moduleIds = moduleDefinitions.map((definition) => definition.id);
  const packageNames = moduleDefinitions.map(
    (definition) => definition.packageName,
  );

  if (repository.name.trim().length === 0)
    errors.push('Repository architecture name must not be empty.');

  for (const [label, values] of [
    ['module ids', moduleIds],
    ['module package names', packageNames],
  ] as const) {
    const duplicates = duplicateValues(values);
    if (duplicates.length > 0)
      errors.push(`Duplicate ${label}: ${duplicates.join(', ')}.`);
  }

  for (const definition of moduleDefinitions) {
    const identity = splitModuleId(definition.id);
    if (identity === null) {
      errors.push(
        `Module id "${definition.id}" must have exactly <family>/<module> segments.`,
      );
      continue;
    }

    const invalid = invalidPathSegments(definition.id);
    if (invalid.length > 0)
      errors.push(
        `Module id "${definition.id}" has invalid segments: ${invalid.join(', ')}.`,
      );

    if (!repository.moduleFamilies.includes(identity.family))
      errors.push(
        `Module "${definition.id}" uses undeclared family "${identity.family}".`,
      );

    if (definition.packageName.trim().length === 0)
      errors.push(`Module "${definition.id}" package name must not be empty.`);

    errors.push(...flattenV2Module(definition).errors);
  }

  return Object.freeze(errors);
};

export const roleForFileName = (fileName: string): ArchitectureRole | null => {
  const normalizedName = normalized(fileName);
  const role = roleSuffixes.find((candidate) =>
    normalizedName.endsWith(`.${candidate}.ts`),
  );

  return role ?? null;
};

const ownerForPath = <Value extends { path: string }>(
  relativePath: string,
  prefix: string,
  owners: ReadonlyMap<string, Value>,
): Value | null => {
  const matchingPath = [...owners.keys()]
    .sort((left, right) => right.length - left.length)
    .find((owner) => relativePath.startsWith(`${prefix}${owner}/`));

  return matchingPath === undefined ? null : (owners.get(matchingPath) ?? null);
};

const classifyV2Source = (
  module: CompiledV2Module,
  relativeFilePath: string,
): SourceLocation => {
  const relative = normalized(relativeFilePath);
  if (relative === 'main.ts' || relative === 'public.ts')
    return Object.freeze({ zone: 'root', file: relative });

  if (relative.startsWith('composition/'))
    return Object.freeze({
      zone: 'composition',
      role: roleForFileName(relative),
    });

  const feature = ownerForPath(relative, 'features/', module.features);
  if (feature !== null)
    return Object.freeze({
      zone: 'feature',
      owner: feature.path,
      role: roleForFileName(relative),
    });

  const foundation = ownerForPath(relative, 'foundations/', module.foundations);
  if (foundation !== null)
    return Object.freeze({
      zone: 'foundation',
      owner: foundation.path,
      role: roleForFileName(relative),
    });

  return Object.freeze({ zone: 'unknown' });
};

const evaluateV2SourceDependency = (
  module: CompiledV2Module,
  source: SourceLocation,
  target: SourceLocation,
): SourceDependencyDecision => {
  if (source.zone === 'unknown')
    return Object.freeze({ allowed: false, reason: 'unknown_source' });
  if (target.zone === 'unknown')
    return Object.freeze({ allowed: false, reason: 'unknown_target' });
  if (source.zone === 'composition') {
    if (target.zone === 'composition')
      return Object.freeze({ allowed: true, reason: 'same_owner' });
    if (target.zone === 'feature' || target.zone === 'foundation')
      return Object.freeze({ allowed: true, reason: 'composition_root' });
    return Object.freeze({
      allowed: false,
      reason: 'invalid_root_dependency',
    });
  }
  if (target.zone === 'composition')
    return source.zone === 'root' && source.file === 'main.ts'
      ? Object.freeze({
          allowed: true,
          reason: 'module_composition_surface',
        })
      : Object.freeze({ allowed: false, reason: 'inward_to_composition' });

  if (source.zone === 'root') {
    if (
      source.file === 'public.ts' &&
      target.zone === 'root' &&
      target.file === 'main.ts'
    )
      return Object.freeze({ allowed: true, reason: 'public_surface' });

    const publicRoles = new Set<ArchitectureRole>([
      'adapter',
      'algorithm',
      'command',
      'entity',
      'error',
      'factory',
      'value',
      'event',
      'lifecycle',
      'model',
      'policy',
      'projection',
      'failure',
      'port',
      'usecase',
    ]);
    if (
      source.file === 'public.ts' &&
      (target.zone === 'feature' || target.zone === 'foundation') &&
      target.role !== null &&
      publicRoles.has(target.role)
    )
      return Object.freeze({ allowed: true, reason: 'public_surface' });

    return Object.freeze({
      allowed: false,
      reason: 'invalid_root_dependency',
    });
  }

  if (target.zone === 'root')
    return Object.freeze({
      allowed: false,
      reason: 'invalid_root_dependency',
    });

  if (source.owner === target.owner && source.zone === target.zone)
    return Object.freeze({ allowed: true, reason: 'same_owner' });

  if (source.zone === 'feature') {
    if (target.zone === 'feature')
      return Object.freeze({ allowed: false, reason: 'sibling_feature' });

    const dependencies = module.features.get(source.owner)?.dependencies;
    return dependencies?.has(target.owner) === true
      ? Object.freeze({
          allowed: true,
          reason: 'declared_feature_foundation',
        })
      : Object.freeze({
          allowed: false,
          reason: 'undeclared_feature_foundation',
        });
  }

  if (target.zone === 'feature')
    return Object.freeze({ allowed: false, reason: 'foundation_to_feature' });

  const dependencies = module.foundations.get(source.owner)?.dependencies;
  return dependencies?.has(target.owner) === true
    ? Object.freeze({
        allowed: true,
        reason: 'declared_foundation_dependency',
      })
    : Object.freeze({
        allowed: false,
        reason: 'undeclared_foundation_dependency',
      });
};

export const compileArchitecture = (
  repository: RepositoryDefinition,
  moduleDefinitions: readonly ModuleDefinition[],
): RepositoryArchitecture => {
  const errors = validateArchitecture(repository, moduleDefinitions);
  if (errors.length > 0)
    throw toolingError({
      code: 'invalid_repository_architecture',
      message: `Invalid repository architecture "${repository.name}":\n${errors
        .map((error) => `- ${error}`)
        .join('\n')}`,
      nativeKind: 'TypeError',
    });

  const modules = new Map<string, CompiledV2Module>();
  for (const definition of moduleDefinitions) {
    const identity = splitModuleId(definition.id);
    if (identity === null) continue;

    const flattened = flattenV2Module(definition);
    modules.set(
      definition.id,
      Object.freeze({
        layout: definition.layout,
        id: definition.id,
        family: identity.family,
        name: identity.name,
        packageName: definition.packageName,
        features: flattened.features,
        foundations: flattened.foundations,
      }),
    );
  }

  const moduleKeys = Object.freeze([...modules.keys()].sort());
  const groupNames = Object.freeze(
    [...new Set([...modules.values()].map((module) => module.family))].sort(),
  );
  const rootFiles = Object.freeze([...repository.moduleRootFiles]);
  const modulePackageNames = Object.freeze(
    [...modules.values()].map((module) => module.packageName).sort(),
  );
  const symbolSurfaces = Object.freeze(
    [...(repository.symbolSurfaces ?? [])].map(normalized).sort(),
  );

  const classifySource = (
    moduleKey: string,
    relativeFilePath: string,
  ): SourceLocation => {
    const module = modules.get(moduleKey);
    if (module === undefined) return Object.freeze({ zone: 'unknown' });
    return classifyV2Source(module, relativeFilePath);
  };

  return Object.freeze({
    name: repository.name,
    rootFiles,
    groupNames,
    moduleKeys,
    modulePackageNames,
    symbolSurfaces,
    modules,
    rootFileDelta: (actualFiles) => delta(rootFiles, actualFiles),
    moduleKeyDelta: (actualModuleKeys) => delta(moduleKeys, actualModuleKeys),
    classifySource,
    evaluateSourceDependency: ({
      moduleKey,
      sourceRelativePath,
      targetRelativePath,
    }) => {
      const module = modules.get(moduleKey);
      if (module === undefined)
        return Object.freeze({ allowed: false, reason: 'unknown_source' });

      return evaluateV2SourceDependency(
        module,
        classifyV2Source(module, sourceRelativePath),
        classifyV2Source(module, targetRelativePath),
      );
    },
  });
};
