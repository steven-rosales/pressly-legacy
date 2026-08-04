import {
  architectureRoles,
  featureProfiles,
  foundationProfiles,
  type ArchitectureRole,
  type ArchitectureTreeNode,
  type FeatureDefinition,
  type FeatureProfileName,
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
  dependencies: ReadonlySet<string>;
  allowedRoles: ReadonlySet<ArchitectureRole>;
  requiredAnyRole: readonly ArchitectureRole[];
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

  const foundations = new Map<string, CompiledFoundation>();
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

    const profile = foundationProfiles[foundation.definition.profile];
    foundations.set(
      foundation.path,
      Object.freeze({
        path: foundation.path,
        profile: foundation.definition.profile,
        dependencies: new Set(foundation.definition.dependsOn),
        allowedRoles: new Set(profile.allowedRoles),
        requiredAnyRole: profile.requiredAnyRole,
      }),
    );
  }

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
      'entity',
      'value',
      'event',
      'lifecycle',
      'model',
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
