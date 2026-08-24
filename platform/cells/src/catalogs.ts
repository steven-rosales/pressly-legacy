import type {
  AuthenticationRequirement,
  AuthorizationManifest,
  CellDefinition,
  CellKind,
  CellManifest,
  FiniteCellKind,
  SubscriptionSession,
} from './cells.ts';
import { decode } from './contracts.ts';
import type {
  BoundaryContractDescriptor,
  CellOutcome,
  DecodeResult,
  SubscriptionContractDescriptor,
} from './contracts.ts';
import {
  defineHttpBoundaryProfile,
  type HttpBoundaryProfile,
  type HttpBoundaryProfilesByOperation,
} from './http-boundary-profiles.ts';
import type { StaticOperationProof } from './operation-proof.ts';
import type {
  CliInvocation,
  CliInvocationFailure,
  CliPresentation,
  CliSurface,
  CliSurfaceManifest,
  EventStreamFrame,
  EventStreamSurface,
  EventStreamSurfaceManifest,
  HttpRequest,
  HttpRequestHead,
  HttpRequestInput,
  HttpResponse,
  HttpSurface,
  HttpSurfaceManifest,
  JobSurface,
  JobFailurePresentation,
  JobSurfaceManifest,
} from './surfaces.ts';

/**
 * The type-erased executable shape accepted by static catalogs. Individual
 * generated catalogs preserve each concrete cell type while generic hosts can
 * use the safe decode/execute/present closures on their entries.
 */
export type ExecutableCell = Omit<
  CellManifest,
  'authorization' | 'contract' | 'kind' | 'surfaces'
> &
  Readonly<{
    kind: FiniteCellKind;
    contract: Omit<CellManifest['contract'], 'input'> &
      Readonly<{
        input: BoundaryContractDescriptor &
          Readonly<{
            decode: (serialized: unknown) => DecodeResult<unknown>;
          }>;
      }>;
    authorization:
      | null
      | (AuthorizationManifest &
          Readonly<{
            timing: 'before-input';
          }>)
      | (AuthorizationManifest &
          Readonly<{
            timing: 'after-input';
            scope: (input: never) => string;
          }>);
    surfaces: readonly (
      | CliSurface<never, never>
      | HttpSurface<never, never>
      | JobSurface<never>
    )[];
    execute: (input: never) => Promise<CellOutcome<unknown, unknown>>;
  }>;

export type ExecutableSubscriptionCell = Omit<
  CellManifest,
  'authorization' | 'contract' | 'kind' | 'surfaces'
> &
  Readonly<{
    kind: 'subscription';
    contract: Omit<SubscriptionContractDescriptor, 'input'> &
      Readonly<{
        input: BoundaryContractDescriptor &
          Readonly<{
            decode: (serialized: unknown) => DecodeResult<unknown>;
          }>;
      }>;
    authorization:
      | null
      | (AuthorizationManifest &
          Readonly<{
            timing: 'before-input';
          }>)
      | (AuthorizationManifest &
          Readonly<{
            timing: 'after-input';
            scope: (input: never) => string;
          }>);
    surfaces: readonly EventStreamSurface<never, never, never>[];
    open: (
      input: never,
    ) => Promise<CellOutcome<SubscriptionSession<unknown, unknown>, unknown>>;
  }>;

type HttpSurfaceOf<Cell> =
  Cell extends Readonly<{
    surfaces: readonly (infer Surface)[];
  }>
    ? Extract<Surface, HttpSurfaceManifest>
    : never;

type CliSurfaceOf<Cell> =
  Cell extends Readonly<{
    surfaces: readonly (infer Surface)[];
  }>
    ? Extract<Surface, CliSurfaceManifest>
    : never;

type JobSurfaceOf<Cell> =
  Cell extends Readonly<{
    surfaces: readonly (infer Surface)[];
  }>
    ? Extract<Surface, JobSurfaceManifest>
    : never;

type EventStreamSurfaceOf<Cell> =
  Cell extends Readonly<{
    surfaces: readonly (infer Surface)[];
  }>
    ? Extract<Surface, EventStreamSurfaceManifest>
    : never;

export type ExecutableAuthorization =
  | Readonly<{
      capability: string;
      timing: 'before-input';
      decodeScope: (request: HttpRequestHead) => DecodeResult<string>;
    }>
  | Readonly<{
      capability: string;
      timing: 'after-input';
      decodeScope: ((request: HttpRequestHead) => DecodeResult<string>) | null;
      resolveScope: (input: unknown) => string;
    }>;

export type ExecutableHttpCatalogEntry<
  Cell extends ExecutableCell = ExecutableCell,
> = Cell extends ExecutableCell
  ? Readonly<{
      operationId: Cell['id'];
      cell: Cell;
      surface: HttpSurfaceOf<Cell>;
      boundaryProfile?: HttpBoundaryProfile;
      authorization: ExecutableAuthorization | null;
      validateRequest: (request: HttpRequestInput) => undefined;
      decodeRequest: (request: HttpRequest) => DecodeResult<unknown>;
      execute: (input: unknown) => Promise<CellOutcome<unknown, unknown>>;
      present: (outcome: CellOutcome<unknown, unknown>) => HttpResponse;
    }>
  : never;

export type ExecutableJobCatalogEntry<
  Cell extends ExecutableCell = ExecutableCell,
> = Cell extends ExecutableCell
  ? Readonly<{
      operationId: Cell['id'];
      cell: Cell;
      surface: JobSurfaceOf<Cell>;
      decodePayload: (payload: unknown) => DecodeResult<unknown>;
      execute: (input: unknown) => Promise<CellOutcome<unknown, unknown>>;
      presentFailure: (failure: unknown) => JobFailurePresentation;
    }>
  : never;

export type ExecutableCliCatalogEntry<
  Cell extends ExecutableCell = ExecutableCell,
> = Cell extends ExecutableCell
  ? Readonly<{
      operationId: Cell['id'];
      cell: Cell;
      surface: CliSurfaceOf<Cell>;
      authorization:
        | null
        | Readonly<{
            capability: string;
            timing: 'before-input';
          }>
        | Readonly<{
            capability: string;
            timing: 'after-input';
            resolveScope: (input: unknown) => string;
          }>;
      decodeInvocation: (
        invocation: CliInvocation,
      ) => Promise<DecodeResult<unknown>>;
      decodeInput: (serialized: unknown) => DecodeResult<unknown>;
      execute: (input: unknown) => Promise<CellOutcome<unknown, unknown>>;
      present: (
        outcome: CellOutcome<unknown, unknown>,
        invocation: CliInvocation,
      ) => CliPresentation;
      presentInvalidInvocation: (
        failure: CliInvocationFailure,
      ) => CliPresentation;
    }>
  : never;

export type ExecutableEventStreamCatalogEntry<
  Cell extends ExecutableSubscriptionCell = ExecutableSubscriptionCell,
> = Cell extends ExecutableSubscriptionCell
  ? Readonly<{
      operationId: Cell['id'];
      cell: Cell;
      surface: EventStreamSurfaceOf<Cell>;
      authorization: ExecutableAuthorization | null;
      decodeRequest: (request: HttpRequest) => DecodeResult<unknown>;
      open: (
        input: unknown,
      ) => Promise<CellOutcome<SubscriptionSession<unknown, unknown>, unknown>>;
      presentReady: (output: unknown) => EventStreamFrame;
      presentEvent: (event: unknown) => EventStreamFrame;
      presentFailure: (failure: unknown) => HttpResponse;
    }>
  : never;

export type ExecutableHttpCatalog<
  Cells extends readonly ExecutableCell[] = readonly ExecutableCell[],
> = Readonly<{
  cells: Cells;
  entries: readonly ExecutableHttpCatalogEntry<Cells[number]>[];
}>;

export type ExecutableJobCatalog<
  Cells extends readonly ExecutableCell[] = readonly ExecutableCell[],
> = Readonly<{
  cells: Cells;
  entries: readonly ExecutableJobCatalogEntry<Cells[number]>[];
}>;

export type ExecutableCliCatalog<
  Cells extends readonly ExecutableCell[] = readonly ExecutableCell[],
> = Readonly<{
  cells: Cells;
  entries: readonly ExecutableCliCatalogEntry<Cells[number]>[];
  program?: CliProgramManifest;
}>;

export type CliProgramUnknownToken = 'after-group' | 'first' | 'none';

export type CliProgramUnknownPresentation = Readonly<{
  stream: 'stderr' | 'stdout';
  exitCode: number;
  prefix: string;
  suffix: string;
  token: CliProgramUnknownToken;
  appendHelp: boolean;
}>;

export type CliProgramGroupManifest = Readonly<{
  name: readonly [string, ...string[]];
  help: CliPresentation;
  unknown: CliProgramUnknownPresentation;
}>;

export type CliProgramManifest = Readonly<{
  id: string;
  helpOptions: readonly string[];
  help: CliPresentation;
  unknown: CliProgramUnknownPresentation;
  groups: readonly CliProgramGroupManifest[];
}>;

export type ExecutableEventStreamCatalog<
  Cells extends readonly ExecutableSubscriptionCell[] =
    readonly ExecutableSubscriptionCell[],
> = Readonly<{
  cells: Cells;
  entries: readonly ExecutableEventStreamCatalogEntry<Cells[number]>[];
}>;

const executableAuthorization = (
  authorization:
    | ExecutableCell['authorization']
    | ExecutableSubscriptionCell['authorization'],
  surface: HttpSurface<never, never> | EventStreamSurface<never, never, never>,
): ExecutableAuthorization | null => {
  if (authorization === null) return null;
  if (authorization.timing === 'before-input')
    return Object.freeze({
      capability: authorization.capability,
      timing: authorization.timing,
      decodeScope:
        surface.decodeAuthorizationScope ??
        (() =>
          decode.invalid([
            {
              path: [],
              message:
                'This route is missing its validated authorization scope decoder.',
            },
          ])),
    });

  return Object.freeze({
    capability: authorization.capability,
    timing: authorization.timing,
    decodeScope: surface.decodeAuthorizationScope,
    resolveScope: (input: unknown) => authorization.scope(input as never),
  });
};

const executableHttpEntry = (
  cell: ExecutableCell,
  surface: HttpSurface<never, never>,
  boundaryProfile: HttpBoundaryProfile | undefined,
): ExecutableHttpCatalogEntry =>
  Object.freeze({
    operationId: cell.id,
    cell,
    surface,
    ...(boundaryProfile === undefined
      ? {}
      : { boundaryProfile: defineHttpBoundaryProfile(boundaryProfile) }),
    authorization: executableAuthorization(cell.authorization, surface),
    validateRequest: (request: HttpRequestInput) =>
      surface.validateRequest?.(request),
    decodeRequest: (request: HttpRequest) =>
      cell.contract.input.decode(surface.toSerializedInput(request)),
    execute: (input: unknown) => cell.execute(input as never),
    present: (outcome: CellOutcome<unknown, unknown>) =>
      surface.present(outcome as CellOutcome<never, never>),
  });

const executableJobEntry = (
  cell: ExecutableCell,
  surface: JobSurface<never>,
): ExecutableJobCatalogEntry =>
  Object.freeze({
    operationId: cell.id,
    cell,
    surface,
    decodePayload: (payload: unknown) =>
      cell.contract.input.decode(surface.toSerializedInput(payload)),
    execute: (input: unknown) => cell.execute(input as never),
    presentFailure: (failure: unknown) =>
      surface.presentFailure(failure as never),
  });

const executableCliEntry = (
  cell: ExecutableCell,
  surface: CliSurface<never, never>,
): ExecutableCliCatalogEntry =>
  Object.freeze({
    operationId: cell.id,
    cell,
    surface,
    authorization:
      cell.authorization === null
        ? null
        : cell.authorization.timing === 'before-input'
          ? Object.freeze({
              capability: cell.authorization.capability,
              timing: cell.authorization.timing,
            })
          : Object.freeze({
              capability: cell.authorization.capability,
              timing: cell.authorization.timing,
              resolveScope: (input: unknown) =>
                cell.authorization === null ||
                cell.authorization.timing !== 'after-input'
                  ? ''
                  : cell.authorization.scope(input as never),
            }),
    decodeInvocation: async (invocation: CliInvocation) =>
      cell.contract.input.decode(await surface.toSerializedInput(invocation)),
    decodeInput: (serialized: unknown) =>
      cell.contract.input.decode(serialized),
    execute: (input: unknown) => cell.execute(input as never),
    present: (
      outcome: CellOutcome<unknown, unknown>,
      invocation: CliInvocation,
    ) => surface.present(outcome as CellOutcome<never, never>, invocation),
    presentInvalidInvocation: (failure: CliInvocationFailure) =>
      surface.presentInvalidInvocation(failure),
  });

const executableEventStreamEntry = (
  cell: ExecutableSubscriptionCell,
  surface: EventStreamSurface<never, never, never>,
): ExecutableEventStreamCatalogEntry =>
  Object.freeze({
    operationId: cell.id,
    cell,
    surface,
    authorization: executableAuthorization(cell.authorization, surface),
    decodeRequest: (request: HttpRequest) =>
      cell.contract.input.decode(surface.toSerializedInput(request)),
    open: (input: unknown) => cell.open(input as never),
    presentReady: (output: unknown) => surface.presentReady(output as never),
    presentEvent: (event: unknown) => surface.presentEvent(event as never),
    presentFailure: (failure: unknown) =>
      surface.presentFailure(failure as never),
  });

export const defineHttpCatalog = <
  const Cells extends readonly ExecutableCell[],
>(
  cells: Cells,
  boundaryProfiles: HttpBoundaryProfilesByOperation = Object.freeze({}),
): ExecutableHttpCatalog<Cells> => {
  const frozenCells = Object.freeze([...cells]) as Cells;
  const entries = frozenCells
    .flatMap((cell) =>
      cell.surfaces.flatMap((surface) =>
        surface.kind === 'http'
          ? [executableHttpEntry(cell, surface, boundaryProfiles[cell.id])]
          : [],
      ),
    )
    .sort((left, right) => {
      const leftKey = `${left.surface.method} ${left.surface.path} ${left.operationId}`;
      const rightKey = `${right.surface.method} ${right.surface.path} ${right.operationId}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });

  return Object.freeze({
    cells: frozenCells,
    entries: Object.freeze(entries),
  }) as ExecutableHttpCatalog<Cells>;
};

export const defineJobCatalog = <const Cells extends readonly ExecutableCell[]>(
  cells: Cells,
): ExecutableJobCatalog<Cells> => {
  const frozenCells = Object.freeze([...cells]) as Cells;
  const entries = frozenCells
    .flatMap((cell) =>
      cell.surfaces.flatMap((surface) =>
        surface.kind === 'job' ? [executableJobEntry(cell, surface)] : [],
      ),
    )
    .sort((left, right) => {
      const leftKey = `${left.surface.id} ${left.operationId}`;
      const rightKey = `${right.surface.id} ${right.operationId}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });

  return Object.freeze({
    cells: frozenCells,
    entries: Object.freeze(entries),
  }) as ExecutableJobCatalog<Cells>;
};

const freezeCliPresentation = (
  presentation: CliPresentation,
): CliPresentation => Object.freeze({ ...presentation });

const freezeCliProgramUnknownPresentation = (
  presentation: CliProgramUnknownPresentation,
): CliProgramUnknownPresentation => Object.freeze({ ...presentation });

export const defineCliProgram = (
  program: CliProgramManifest,
): CliProgramManifest =>
  Object.freeze({
    id: program.id,
    helpOptions: Object.freeze([...program.helpOptions]),
    help: freezeCliPresentation(program.help),
    unknown: freezeCliProgramUnknownPresentation(program.unknown),
    groups: Object.freeze(
      program.groups.map((group) =>
        Object.freeze({
          name: Object.freeze([...group.name]) as readonly [
            string,
            ...string[],
          ],
          help: freezeCliPresentation(group.help),
          unknown: freezeCliProgramUnknownPresentation(group.unknown),
        }),
      ),
    ),
  });

export const defineCliCatalog = <const Cells extends readonly ExecutableCell[]>(
  cells: Cells,
  program?: CliProgramManifest,
): ExecutableCliCatalog<Cells> => {
  const frozenCells = Object.freeze([...cells]) as Cells;
  const entries = frozenCells
    .flatMap((cell) =>
      cell.surfaces.flatMap((surface) =>
        surface.kind === 'cli' ? [executableCliEntry(cell, surface)] : [],
      ),
    )
    .sort((left, right) => {
      const leftKey = `${left.surface.name.join('\u0000')} ${left.surface.id} ${left.operationId}`;
      const rightKey = `${right.surface.name.join('\u0000')} ${right.surface.id} ${right.operationId}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });

  return Object.freeze({
    cells: frozenCells,
    entries: Object.freeze(entries),
    ...(program === undefined ? {} : { program: defineCliProgram(program) }),
  }) as ExecutableCliCatalog<Cells>;
};

export const defineEventStreamCatalog = <
  const Cells extends readonly ExecutableSubscriptionCell[],
>(
  cells: Cells,
): ExecutableEventStreamCatalog<Cells> => {
  const frozenCells = Object.freeze([...cells]) as Cells;
  const entries = frozenCells
    .flatMap((cell) =>
      cell.surfaces.map((surface) => executableEventStreamEntry(cell, surface)),
    )
    .sort((left, right) => {
      const leftKey = `${left.surface.method} ${left.surface.path} ${left.operationId}`;
      const rightKey = `${right.surface.method} ${right.surface.path} ${right.operationId}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });

  return Object.freeze({
    cells: frozenCells,
    entries: Object.freeze(entries),
  }) as ExecutableEventStreamCatalog<Cells>;
};

export type ClientCatalogDefinition = Readonly<{
  experienceId: string;
  cells: readonly CellManifest[];
}>;

export const defineClientCatalogs = <
  const Catalogs extends readonly ClientCatalogDefinition[],
>(
  catalogs: Catalogs,
): readonly ClientCatalogDefinition[] =>
  Object.freeze(
    catalogs.map((catalog) =>
      Object.freeze({
        experienceId: catalog.experienceId,
        cells: Object.freeze([...catalog.cells]),
      }),
    ),
  );

export type CellInputOf<Cell> =
  Cell extends CellDefinition<FiniteCellKind, infer Input, unknown, unknown>
    ? Input
    : never;

export type CellOutputOf<Cell> =
  Cell extends CellDefinition<FiniteCellKind, unknown, infer Output, unknown>
    ? Output
    : never;

export type CellFailureOf<Cell> =
  Cell extends CellDefinition<FiniteCellKind, unknown, unknown, infer Failure>
    ? Failure
    : never;

export type ClientFor<Cells extends readonly unknown[]> = Readonly<{
  [Cell in Cells[number] as Cell extends Readonly<{
    id: infer Id extends string;
  }>
    ? Id
    : never]: (
    input: CellInputOf<Cell>,
  ) => Promise<
    | Readonly<{ kind: 'success'; value: CellOutputOf<Cell> }>
    | Readonly<{ kind: 'failure'; failure: CellFailureOf<Cell> }>
  >;
}>;

export type StaticArchitectureOperation = Readonly<{
  id: string;
  kind: CellKind;
  authentication: AuthenticationRequirement;
  owner: string;
  ownerKind: 'experience' | 'system';
  source: Readonly<{
    moduleSpecifier: string;
    manifestExportName: string;
    assemblyExportName: string;
    assemblyKey: string;
  }>;
  authorization: Readonly<{
    capability: string;
    timing: 'after-input' | 'before-input';
  }> | null;
  consistency: Readonly<{
    transaction: 'none' | 'required';
    concurrency: 'none' | 'optimistic' | 'partitioned';
    idempotencyRequired: boolean;
  }>;
  cli: readonly CliSurfaceManifest[];
  eventStreams: readonly Readonly<{
    method: 'GET';
    path: string;
    retryMs: number;
    eventTypes: readonly string[];
  }>[];
  http: readonly Readonly<{
    method: string;
    path: string;
    contextRequirements: readonly string[];
    boundaryProfile?: string;
  }>[];
  jobs: readonly Readonly<{ id: string; trigger: string }>[];
  emits: readonly string[];
  consumes: readonly string[];
  experienceConsumers: readonly string[];
  observability: string;
  paths: StaticArchitecturePaths | null;
}>;

export type StaticArchitecturePaths = Readonly<{
  cell: string;
  contracts: readonly string[];
  decisions: readonly string[];
  executors: readonly string[];
  persistence: readonly string[];
  state: readonly string[];
  events: readonly string[];
  protocols: readonly string[];
  tests: readonly string[];
  features: readonly StaticArchitectureFeature[];
  proofs: readonly StaticOperationProof[];
}>;

export type StaticArchitectureFeature = Readonly<{
  id: string;
  experience: string;
  path: string;
  uses: readonly string[];
  stateProofs: readonly string[];
  componentProofs: readonly string[];
}>;

export type StaticArchitectureMap = Readonly<{
  topologyId: string;
  features: readonly StaticArchitectureFeature[];
  operations: readonly StaticArchitectureOperation[];
}>;

export const defineArchitectureMap = <const Map extends StaticArchitectureMap>(
  map: Map,
): StaticArchitectureMap =>
  Object.freeze({
    topologyId: map.topologyId,
    features: Object.freeze(
      map.features.map((feature) =>
        Object.freeze({
          ...feature,
          uses: Object.freeze([...feature.uses]),
          stateProofs: Object.freeze([...feature.stateProofs]),
          componentProofs: Object.freeze([...feature.componentProofs]),
        }),
      ),
    ),
    operations: Object.freeze(
      map.operations.map((operation) =>
        Object.freeze({
          ...operation,
          source: Object.freeze({ ...operation.source }),
          authorization:
            operation.authorization === null
              ? null
              : Object.freeze({ ...operation.authorization }),
          consistency: Object.freeze({ ...operation.consistency }),
          cli: Object.freeze(
            operation.cli.map((surface) =>
              Object.freeze({
                ...surface,
                name: Object.freeze([...surface.name]) as readonly [
                  string,
                  ...string[],
                ],
                arguments: Object.freeze(
                  surface.arguments.map((argument) =>
                    Object.freeze({ ...argument }),
                  ),
                ),
                options: Object.freeze(
                  surface.options.map((option) => Object.freeze({ ...option })),
                ),
                stdin: Object.freeze({ ...surface.stdin }),
                contextRequirements: Object.freeze([
                  ...surface.contextRequirements,
                ]),
                capabilityRequirements: Object.freeze([
                  ...surface.capabilityRequirements,
                ]),
                interactive:
                  surface.interactive === null
                    ? null
                    : Object.freeze({
                        exitCodes: Object.freeze([
                          ...surface.interactive.exitCodes,
                        ]),
                      }),
                presentation: Object.freeze({
                  success: Object.freeze({
                    ...surface.presentation.success,
                    exitCodes: Object.freeze([
                      ...surface.presentation.success.exitCodes,
                    ]),
                  }),
                  failure: Object.freeze({
                    ...surface.presentation.failure,
                    exitCodes: Object.freeze([
                      ...surface.presentation.failure.exitCodes,
                    ]),
                  }),
                  invalidInvocation: Object.freeze({
                    ...surface.presentation.invalidInvocation,
                  }),
                }),
              }),
            ),
          ),
          eventStreams: Object.freeze(
            operation.eventStreams.map((surface) =>
              Object.freeze({
                ...surface,
                eventTypes: Object.freeze([...surface.eventTypes]),
              }),
            ),
          ),
          http: Object.freeze(
            operation.http.map((surface) =>
              Object.freeze({
                ...surface,
                contextRequirements: Object.freeze([
                  ...surface.contextRequirements,
                ]),
              }),
            ),
          ),
          jobs: Object.freeze(
            operation.jobs.map((surface) => Object.freeze({ ...surface })),
          ),
          emits: Object.freeze([...operation.emits]),
          consumes: Object.freeze([...operation.consumes]),
          experienceConsumers: Object.freeze([
            ...operation.experienceConsumers,
          ]),
          paths:
            operation.paths === null
              ? null
              : Object.freeze({
                  cell: operation.paths.cell,
                  contracts: Object.freeze([...operation.paths.contracts]),
                  decisions: Object.freeze([...operation.paths.decisions]),
                  executors: Object.freeze([...operation.paths.executors]),
                  persistence: Object.freeze([...operation.paths.persistence]),
                  state: Object.freeze([...operation.paths.state]),
                  events: Object.freeze([...operation.paths.events]),
                  protocols: Object.freeze([...operation.paths.protocols]),
                  tests: Object.freeze([...operation.paths.tests]),
                  features: Object.freeze(
                    operation.paths.features.map((feature) =>
                      Object.freeze({
                        ...feature,
                        uses: Object.freeze([...feature.uses]),
                        stateProofs: Object.freeze([...feature.stateProofs]),
                        componentProofs: Object.freeze([
                          ...feature.componentProofs,
                        ]),
                      }),
                    ),
                  ),
                  proofs: Object.freeze(
                    operation.paths.proofs.map((proof) =>
                      Object.freeze({
                        ...proof,
                        scenarios: Object.freeze(
                          proof.scenarios.map((scenario) =>
                            Object.freeze({
                              ...scenario,
                              proves: Object.freeze([...scenario.proves]),
                            }),
                          ),
                        ),
                      }),
                    ),
                  ),
                }),
        }),
      ),
    ),
  });
