import {
  defineCliProgram,
  defineHttpBoundaryProfile,
  type CellManifest,
  type CliProgramManifest,
  type ExperienceFeatureManifest,
  type HttpBoundaryProfile,
} from '@pressly/cells';

export type CellSourceReference = Readonly<{
  moduleSpecifier: string;
  manifestExportName: string;
  assemblyExportName: string;
  assemblyKey: string;
}>;

export type StaticCellManifest = CellManifest & Readonly<{ execute?: never }>;

export type CellSelection<
  Cell extends StaticCellManifest = StaticCellManifest,
> = Readonly<{
  manifest: Cell;
  source: CellSourceReference;
}>;

export type SystemDefinition = Readonly<{
  kind: 'system';
  id: string;
  cells: readonly CellSelection[];
}>;

export type ExperienceFeatureSourceReference = Readonly<{
  moduleSpecifier: string;
  manifestExportName: string;
  repositoryPath: string;
}>;

export type ExperienceFeatureSelection = Readonly<{
  manifest: ExperienceFeatureManifest;
  source: ExperienceFeatureSourceReference;
}>;

export type ExperienceDefinition = Readonly<{
  kind: 'experience';
  id: string;
  cells: readonly CellSelection[];
  uses: readonly string[];
  features: readonly ExperienceFeatureSelection[];
}>;

export type ExperienceDefinitionInput = Omit<
  ExperienceDefinition,
  'features' | 'kind'
> &
  Readonly<{ features?: readonly ExperienceFeatureSelection[] }>;

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

export const selectCell = <const Cell extends StaticCellManifest>(
  selection: CellSelection<Cell>,
): CellSelection<Cell> =>
  Object.freeze({
    manifest: selection.manifest,
    source: Object.freeze({ ...selection.source }),
  });

export const selectExperienceFeature = (
  selection: ExperienceFeatureSelection,
): ExperienceFeatureSelection =>
  Object.freeze({
    manifest: selection.manifest,
    source: Object.freeze({ ...selection.source }),
  });

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
