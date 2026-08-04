type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];

export const architectureRoles = [
  'entity',
  'value',
  'event',
  'lifecycle',
  'model',
  'policy',
  'projection',
  'algorithm',
  'failure',
  'error',
  'port',
  'repo',
  'adapter',
  'route',
  'controller',
  'middleware',
  'command',
  'usecase',
  'composition',
  'contract.mapper',
  'persistence.mapper',
  'projection.mapper',
  'factory',
] as const;

export type ArchitectureRole = (typeof architectureRoles)[number];

export type FeatureProfileName =
  | 'http-command'
  | 'http-query'
  | 'headless-command'
  | 'headless-query'
  | 'pure-policy'
  | 'message-consumer';

export type FoundationProfileName =
  | 'language'
  | 'algorithm'
  | 'port'
  | 'adapter';

export type FeatureProfile = Readonly<{
  allowedRoles: readonly ArchitectureRole[];
  requiredRoles: readonly ArchitectureRole[];
}>;

export type FoundationProfile = Readonly<{
  allowedRoles: readonly ArchitectureRole[];
  requiredAnyRole: readonly ArchitectureRole[];
}>;

const semanticRoles = [
  'entity',
  'value',
  'event',
  'lifecycle',
  'model',
  'policy',
  'projection',
  'failure',
  'error',
] as const satisfies readonly ArchitectureRole[];

const applicationRoles = [
  ...semanticRoles,
  'port',
  'repo',
  'adapter',
  'usecase',
  'persistence.mapper',
  'projection.mapper',
] as const satisfies readonly ArchitectureRole[];

const httpRoles = [
  ...applicationRoles,
  'route',
  'controller',
  'middleware',
  'contract.mapper',
] as const satisfies readonly ArchitectureRole[];

const featureProfile = (
  allowedRoles: readonly ArchitectureRole[],
  requiredRoles: readonly ArchitectureRole[],
): FeatureProfile =>
  Object.freeze({
    allowedRoles: Object.freeze([...allowedRoles]),
    requiredRoles: Object.freeze([...requiredRoles]),
  });

const foundationProfile = (
  allowedRoles: readonly ArchitectureRole[],
  requiredAnyRole: readonly ArchitectureRole[],
): FoundationProfile =>
  Object.freeze({
    allowedRoles: Object.freeze([...allowedRoles]),
    requiredAnyRole: Object.freeze([...requiredAnyRole]),
  });

export const featureProfiles: Readonly<
  Record<FeatureProfileName, FeatureProfile>
> = Object.freeze({
  'http-command': featureProfile(httpRoles, ['route', 'controller', 'usecase']),
  'http-query': featureProfile(httpRoles, ['route', 'controller', 'usecase']),
  'headless-command': featureProfile(
    [...applicationRoles, 'command'],
    ['usecase'],
  ),
  'headless-query': featureProfile(applicationRoles, ['usecase']),
  'pure-policy': featureProfile(semanticRoles, ['policy']),
  'message-consumer': featureProfile(
    [...applicationRoles, 'command', 'contract.mapper'],
    ['usecase'],
  ),
});

export const foundationProfiles: Readonly<
  Record<FoundationProfileName, FoundationProfile>
> = Object.freeze({
  language: foundationProfile([...semanticRoles, 'factory'], semanticRoles),
  algorithm: foundationProfile(
    [
      'algorithm',
      'model',
      'policy',
      'projection',
      'failure',
      'error',
      'factory',
    ],
    ['algorithm'],
  ),
  port: foundationProfile(['port'], ['port']),
  adapter: foundationProfile(
    ['adapter', 'repo', 'contract.mapper', 'persistence.mapper', 'error'],
    ['adapter', 'repo', 'contract.mapper', 'persistence.mapper'],
  ),
});

export type NamespaceDefinition = Readonly<{
  node: 'namespace';
  children: Readonly<Record<string, ArchitectureTreeNode>>;
}>;

export type FeatureDefinition = Readonly<{
  node: 'feature';
  profile: FeatureProfileName;
  dependsOn: readonly string[];
}>;

export type FoundationDefinition = Readonly<{
  node: 'foundation';
  profile: FoundationProfileName;
  dependsOn: readonly string[];
}>;

export type ArchitectureTreeNode =
  | NamespaceDefinition
  | FeatureDefinition
  | FoundationDefinition;

export type FoundationCategory =
  | 'language'
  | 'algorithms'
  | 'ports'
  | 'adapters';

export type ModuleDefinition = Readonly<{
  layout: 'feature-foundation-v2';
  id: string;
  packageName: string;
  features: NamespaceDefinition;
  foundations?: Readonly<
    Partial<Record<FoundationCategory, NamespaceDefinition>>
  >;
}>;

export type PackageKind =
  | 'pure'
  | 'contract'
  | 'persistence'
  | 'http'
  | 'observability'
  | 'runtime';

export type RepositoryDefinition = Readonly<{
  name: string;
  moduleFamilies: NonEmptyReadonlyArray<string>;
  moduleRootFiles: NonEmptyReadonlyArray<string>;
  packageKinds: Readonly<Partial<Record<PackageKind, readonly string[]>>>;
}>;

type FeatureOptions = Readonly<{ dependsOn?: readonly string[] }>;
type FoundationOptions = Readonly<{ dependsOn?: readonly string[] }>;

const feature = (
  profile: FeatureProfileName,
  options: FeatureOptions = {},
): FeatureDefinition =>
  Object.freeze({
    node: 'feature',
    profile,
    dependsOn: Object.freeze([...(options.dependsOn ?? [])]),
  });

const foundation = (
  profile: FoundationProfileName,
  options: FoundationOptions = {},
): FoundationDefinition =>
  Object.freeze({
    node: 'foundation',
    profile,
    dependsOn: Object.freeze([...(options.dependsOn ?? [])]),
  });

export const defineFeature = Object.freeze({
  httpCommand: (options?: FeatureOptions): FeatureDefinition =>
    feature('http-command', options),
  httpQuery: (options?: FeatureOptions): FeatureDefinition =>
    feature('http-query', options),
  headlessCommand: (options?: FeatureOptions): FeatureDefinition =>
    feature('headless-command', options),
  headlessQuery: (options?: FeatureOptions): FeatureDefinition =>
    feature('headless-query', options),
  purePolicy: (options?: FeatureOptions): FeatureDefinition =>
    feature('pure-policy', options),
  messageConsumer: (options?: FeatureOptions): FeatureDefinition =>
    feature('message-consumer', options),
});

export const defineFoundation = Object.freeze({
  language: (options?: FoundationOptions): FoundationDefinition =>
    foundation('language', options),
  algorithm: (options?: FoundationOptions): FoundationDefinition =>
    foundation('algorithm', options),
  port: (options?: FoundationOptions): FoundationDefinition =>
    foundation('port', options),
  adapter: (options?: FoundationOptions): FoundationDefinition =>
    foundation('adapter', options),
});

export const defineNamespace = <
  const Children extends Readonly<Record<string, ArchitectureTreeNode>>,
>(
  children: Children,
): NamespaceDefinition =>
  Object.freeze({
    node: 'namespace',
    children: Object.freeze({ ...children }),
  });

export const defineModule = <
  const Definition extends Omit<ModuleDefinition, 'layout'>,
>(
  definition: Definition,
): ModuleDefinition =>
  Object.freeze({
    ...definition,
    layout: 'feature-foundation-v2',
  });

export const defineRepository = <const Definition extends RepositoryDefinition>(
  definition: Definition,
): RepositoryDefinition => Object.freeze({ ...definition });
