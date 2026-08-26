import type {
  AuthorizationManifest,
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
 * topology catalogs preserve each concrete cell type while generic hosts can
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
