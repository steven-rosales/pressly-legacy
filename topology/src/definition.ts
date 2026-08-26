import {
  defineCliProgram,
  defineHttpBoundaryProfile,
  type CellManifest,
  type CliProgramManifest,
  type ExperienceFeatureManifest,
  type HttpBoundaryProfile,
} from '@pressly/cells';

/** The small, runtime-neutral shape shared by the handwritten topology roots. */
export type SystemDefinition = Readonly<{
  kind: 'system';
  id: string;
  cells: readonly CellManifest[];
}>;

export type ExperienceDefinition = Readonly<{
  kind: 'experience';
  id: string;
  cells: readonly CellManifest[];
  uses: readonly string[];
  features: readonly ExperienceFeatureManifest[];
}>;

export type ExperienceDefinitionInput = Omit<
  ExperienceDefinition,
  'features' | 'kind'
> &
  Readonly<{ features?: readonly ExperienceFeatureManifest[] }>;

export type HttpBoundaryProfileBinding = Readonly<{
  operationId: string;
  profileId: string;
}>;

export type TopologyDefinition = Readonly<{
  id: string;
  systems: readonly SystemDefinition[];
  experiences: readonly ExperienceDefinition[];
  cliProgram: CliProgramManifest | null;
  httpBoundaryProfiles: readonly HttpBoundaryProfile[];
  httpBoundaryBindings: readonly HttpBoundaryProfileBinding[];
}>;

export type TopologyDefinitionInput = Omit<
  TopologyDefinition,
  'cliProgram' | 'httpBoundaryBindings' | 'httpBoundaryProfiles'
> &
  Readonly<{
    cliProgram?: CliProgramManifest;
    httpBoundaryProfiles?: readonly HttpBoundaryProfile[];
    httpBoundaryBindings?: readonly HttpBoundaryProfileBinding[];
  }>;

export const defineSystem = (
  definition: Omit<SystemDefinition, 'kind'>,
): SystemDefinition =>
  Object.freeze({
    kind: 'system',
    id: definition.id,
    cells: Object.freeze([...definition.cells]),
  });

export const defineExperience = (
  definition: ExperienceDefinitionInput,
): ExperienceDefinition =>
  Object.freeze({
    kind: 'experience',
    id: definition.id,
    cells: Object.freeze([...definition.cells]),
    uses: Object.freeze([...definition.uses]),
    features: Object.freeze([...(definition.features ?? [])]),
  });

export const bindHttpBoundaryProfile = (
  binding: HttpBoundaryProfileBinding,
): HttpBoundaryProfileBinding => Object.freeze({ ...binding });

export const defineTopology = (
  definition: TopologyDefinitionInput,
): TopologyDefinition =>
  Object.freeze({
    id: definition.id,
    systems: Object.freeze([...definition.systems]),
    experiences: Object.freeze([...definition.experiences]),
    cliProgram:
      definition.cliProgram === undefined
        ? null
        : defineCliProgram(definition.cliProgram),
    httpBoundaryProfiles: Object.freeze(
      (definition.httpBoundaryProfiles ?? []).map(defineHttpBoundaryProfile),
    ),
    httpBoundaryBindings: Object.freeze(
      (definition.httpBoundaryBindings ?? []).map(bindHttpBoundaryProfile),
    ),
  });
