import type {
  CellContract,
  CellContractDescriptor,
  CellOutcome,
  MessageContractDescriptor,
  SubscriptionContract,
  SubscriptionContractDescriptor,
} from './contracts.ts';
import type {
  CliSurface,
  CellSurfaceManifest,
  EventStreamSurface,
  FiniteCellSurface,
  HttpSurface,
  JobSurface,
} from './surfaces.ts';

export type NonEmptyReadonlyArray<Value> = readonly [Value, ...Value[]];

export type FiniteCellKind = 'command' | 'process' | 'query' | 'reaction';

export type CellKind = FiniteCellKind | 'subscription';

export type AuthenticationRequirement = 'none' | 'required';

export type AuthorizationManifest = Readonly<{
  capability: string;
  timing: 'after-input' | 'before-input';
}>;

export type AuthorizationDefinition<Input> =
  | (AuthorizationManifest &
      Readonly<{
        timing: 'before-input';
      }>)
  | (AuthorizationManifest &
      Readonly<{
        timing: 'after-input';
        scope: (input: Input) => string;
      }>);

export type ConsistencyManifest = Readonly<{
  transaction: 'none' | 'required';
  concurrency: 'none' | 'optimistic' | 'partitioned';
}>;

export type ConsistencyDefinition<Input> = ConsistencyManifest &
  Readonly<{
    concurrencyKey?: (input: Input) => string;
    expectedVersion?: (input: Input) => number | string | null;
  }>;

export type IdempotencyManifest = Readonly<{
  required: boolean;
}>;

export type IdempotencyDefinition<Input> = IdempotencyManifest &
  Readonly<{
    key?: (input: Input) => string;
    fingerprint?: (input: Input) => string;
  }>;

export type RetryStrategy = 'bounded-exponential-jitter' | 'none';

export type RetryManifest = Readonly<{
  maxAttempts: number;
  strategy: RetryStrategy;
  deadLetter: 'discard' | 'retain';
}>;

export type CellManifest = Readonly<{
  id: string;
  kind: CellKind;
  authentication: AuthenticationRequirement;
  contract: CellContractDescriptor | SubscriptionContractDescriptor;
  authorization: AuthorizationManifest | null;
  consistency: ConsistencyManifest;
  idempotency: IdempotencyManifest;
  surfaces: readonly CellSurfaceManifest[];
  emits: readonly MessageContractDescriptor[];
  consumes: readonly MessageContractDescriptor[];
  retry: RetryManifest | null;
  timeoutMs: number | null;
  observability: Readonly<{ operation: string }>;
}>;

export type CellDeclaration<
  Kind extends FiniteCellKind,
  Input,
  Output,
  Failure,
> = Omit<
  CellManifest,
  | 'kind'
  | 'authentication'
  | 'contract'
  | 'authorization'
  | 'consistency'
  | 'idempotency'
  | 'surfaces'
  | 'emits'
  | 'consumes'
> &
  Readonly<{
    kind: Kind;
    authentication: AuthenticationRequirement;
    contract: CellContract<Input, Output, Failure>;
    authorization: AuthorizationDefinition<Input> | null;
    consistency: ConsistencyDefinition<Input>;
    idempotency: IdempotencyDefinition<Input>;
    surfaces: readonly FiniteCellSurface<Output, Failure>[];
    emits: readonly MessageContractDescriptor[];
    consumes: readonly MessageContractDescriptor[];
  }>;

export type CellDefinition<
  Kind extends FiniteCellKind,
  Input,
  Output,
  Failure,
> = CellDeclaration<Kind, Input, Output, Failure> &
  Readonly<{
    execute: (input: Input) => Promise<CellOutcome<Output, Failure>>;
  }>;

type CommonDeclarationInput<Input, Output, Failure> = Readonly<{
  id: string;
  authentication?: AuthenticationRequirement;
  contract: CellContract<Input, Output, Failure>;
  authorization?: AuthorizationDefinition<Input>;
  consistency?: ConsistencyDefinition<Input>;
  idempotency?: IdempotencyDefinition<Input>;
  surfaces?: readonly FiniteCellSurface<Output, Failure>[];
  emits?: readonly MessageContractDescriptor[];
  consumes?: readonly MessageContractDescriptor[];
  retry?: RetryManifest;
  timeoutMs?: number;
  observability: Readonly<{ operation: string }>;
}>;

type CommonCellInput<Input, Output, Failure> = CommonDeclarationInput<
  Input,
  Output,
  Failure
> &
  Readonly<{
    execute: (input: Input) => Promise<CellOutcome<Output, Failure>>;
  }>;

export type CommandCellInput<Input, Output, Failure> = CommonCellInput<
  Input,
  Output,
  Failure
>;

export type QueryCellInput<Input, Output, Failure> = Omit<
  CommonCellInput<Input, Output, Failure>,
  'consumes' | 'emits' | 'idempotency' | 'retry' | 'surfaces'
> &
  Readonly<{
    surfaces?: readonly (
      | CliSurface<Output, Failure>
      | HttpSurface<Output, Failure>
    )[];
  }>;

export type ReactionCellInput<Input, Output, Failure> = Omit<
  CommonCellInput<Input, Output, Failure>,
  'consumes' | 'retry' | 'surfaces'
> &
  Readonly<{
    consumes: NonEmptyReadonlyArray<MessageContractDescriptor>;
    retry: RetryManifest;
    surfaces: NonEmptyReadonlyArray<JobSurface<Failure>>;
  }>;

export type ProcessCellInput<Input, Output, Failure> = Omit<
  CommonCellInput<Input, Output, Failure>,
  'surfaces'
> &
  Readonly<{ surfaces: NonEmptyReadonlyArray<JobSurface<Failure>> }>;

export type CommandCellDeclarationInput<Input, Output, Failure> = Omit<
  CommandCellInput<Input, Output, Failure>,
  'execute'
>;

export type QueryCellDeclarationInput<Input, Output, Failure> = Omit<
  QueryCellInput<Input, Output, Failure>,
  'execute'
>;

export type ReactionCellDeclarationInput<Input, Output, Failure> = Omit<
  ReactionCellInput<Input, Output, Failure>,
  'execute'
>;

export type ProcessCellDeclarationInput<Input, Output, Failure> = Omit<
  ProcessCellInput<Input, Output, Failure>,
  'execute'
>;

const noConsistency: ConsistencyDefinition<never> = Object.freeze({
  transaction: 'none',
  concurrency: 'none',
});

const noIdempotency: IdempotencyDefinition<never> = Object.freeze({
  required: false,
});

const freezeDeclaration = <Kind extends FiniteCellKind, Input, Output, Failure>(
  kind: Kind,
  definition: CommonDeclarationInput<Input, Output, Failure>,
): CellDeclaration<Kind, Input, Output, Failure> => {
  const authorization = definition.authorization ?? null;
  return Object.freeze({
    id: definition.id,
    kind,
    authentication:
      authorization === null
        ? (definition.authentication ?? 'none')
        : 'required',
    contract: definition.contract,
    authorization,
    consistency:
      definition.consistency ?? (noConsistency as ConsistencyDefinition<Input>),
    idempotency:
      definition.idempotency ?? (noIdempotency as IdempotencyDefinition<Input>),
    surfaces: Object.freeze([...(definition.surfaces ?? [])]),
    emits: Object.freeze([...(definition.emits ?? [])]),
    consumes: Object.freeze([...(definition.consumes ?? [])]),
    retry:
      definition.retry === undefined ? null : Object.freeze(definition.retry),
    timeoutMs: definition.timeoutMs ?? null,
    observability: Object.freeze({ ...definition.observability }),
  });
};

export const bindCell = <Kind extends FiniteCellKind, Input, Output, Failure>(
  declaration: CellDeclaration<Kind, Input, Output, Failure>,
  execute: (input: Input) => Promise<CellOutcome<Output, Failure>>,
): CellDefinition<Kind, Input, Output, Failure> =>
  Object.freeze({ ...declaration, execute });

export const declareCommandCell = <Input, Output, Failure>(
  definition: CommandCellDeclarationInput<Input, Output, Failure>,
): CellDeclaration<'command', Input, Output, Failure> =>
  freezeDeclaration('command', definition);

export const declareQueryCell = <Input, Output, Failure>(
  definition: QueryCellDeclarationInput<Input, Output, Failure>,
): CellDeclaration<'query', Input, Output, Failure> =>
  freezeDeclaration('query', definition);

export const declareReactionCell = <Input, Output, Failure>(
  definition: ReactionCellDeclarationInput<Input, Output, Failure>,
): CellDeclaration<'reaction', Input, Output, Failure> =>
  freezeDeclaration('reaction', definition);

export const declareProcessCell = <Input, Output, Failure>(
  definition: ProcessCellDeclarationInput<Input, Output, Failure>,
): CellDeclaration<'process', Input, Output, Failure> =>
  freezeDeclaration('process', definition);

export const defineCommandCell = <Input, Output, Failure>(
  definition: CommandCellInput<Input, Output, Failure>,
): CellDefinition<'command', Input, Output, Failure> => {
  const { execute, ...declaration } = definition;
  return bindCell(declareCommandCell(declaration), execute);
};

export const defineQueryCell = <Input, Output, Failure>(
  definition: QueryCellInput<Input, Output, Failure>,
): CellDefinition<'query', Input, Output, Failure> => {
  const { execute, ...declaration } = definition;
  return bindCell(declareQueryCell(declaration), execute);
};

export const defineReactionCell = <Input, Output, Failure>(
  definition: ReactionCellInput<Input, Output, Failure>,
): CellDefinition<'reaction', Input, Output, Failure> => {
  const { execute, ...declaration } = definition;
  return bindCell(declareReactionCell(declaration), execute);
};

export const defineProcessCell = <Input, Output, Failure>(
  definition: ProcessCellInput<Input, Output, Failure>,
): CellDefinition<'process', Input, Output, Failure> => {
  const { execute, ...declaration } = definition;
  return bindCell(declareProcessCell(declaration), execute);
};

export type SubscriptionObserver<Event> = Readonly<{
  next: (event: Event) => void;
  close: () => void;
  error: (error: unknown) => void;
}>;

export type SubscriptionSession<Output, Event> = Readonly<{
  ready: Output;
  /**
   * Attaches the one host observer. A session may synchronously replay only a
   * bounded race-closing event set before this function returns.
   */
  subscribe: (observer: SubscriptionObserver<Event>) => () => void;
  close: () => Promise<void> | void;
}>;

export type SubscriptionCellDeclaration<Input, Output, Event, Failure> = Omit<
  CellManifest,
  | 'kind'
  | 'authentication'
  | 'contract'
  | 'authorization'
  | 'consistency'
  | 'idempotency'
  | 'surfaces'
  | 'emits'
  | 'consumes'
  | 'retry'
  | 'timeoutMs'
> &
  Readonly<{
    kind: 'subscription';
    authentication: AuthenticationRequirement;
    contract: SubscriptionContract<Input, Output, Event, Failure>;
    authorization: AuthorizationDefinition<Input> | null;
    consistency: ConsistencyDefinition<Input>;
    idempotency: IdempotencyDefinition<Input>;
    surfaces: readonly EventStreamSurface<Output, Event, Failure>[];
    emits: readonly [];
    consumes: readonly [];
    retry: null;
    timeoutMs: null;
  }>;

export type SubscriptionCellDefinition<Input, Output, Event, Failure> =
  SubscriptionCellDeclaration<Input, Output, Event, Failure> &
    Readonly<{
      open: (
        input: Input,
      ) => Promise<CellOutcome<SubscriptionSession<Output, Event>, Failure>>;
    }>;

export type SubscriptionCellDeclarationInput<Input, Output, Event, Failure> =
  Readonly<{
    id: string;
    authentication?: AuthenticationRequirement;
    contract: SubscriptionContract<Input, Output, Event, Failure>;
    authorization?: AuthorizationDefinition<Input>;
    surfaces: NonEmptyReadonlyArray<EventStreamSurface<Output, Event, Failure>>;
    observability: Readonly<{ operation: string }>;
  }>;

export type SubscriptionCellInput<Input, Output, Event, Failure> =
  SubscriptionCellDeclarationInput<Input, Output, Event, Failure> &
    Readonly<{
      open: (
        input: Input,
      ) => Promise<CellOutcome<SubscriptionSession<Output, Event>, Failure>>;
    }>;

export const declareSubscriptionCell = <Input, Output, Event, Failure>(
  definition: SubscriptionCellDeclarationInput<Input, Output, Event, Failure>,
): SubscriptionCellDeclaration<Input, Output, Event, Failure> => {
  const authorization = definition.authorization ?? null;
  return Object.freeze({
    id: definition.id,
    kind: 'subscription',
    authentication:
      authorization === null
        ? (definition.authentication ?? 'none')
        : 'required',
    contract: definition.contract,
    authorization,
    consistency: noConsistency as ConsistencyDefinition<Input>,
    idempotency: noIdempotency as IdempotencyDefinition<Input>,
    surfaces: Object.freeze([...definition.surfaces]),
    emits: Object.freeze([]) as readonly [],
    consumes: Object.freeze([]) as readonly [],
    retry: null,
    timeoutMs: null,
    observability: Object.freeze({ ...definition.observability }),
  });
};

export const bindSubscriptionCell = <Input, Output, Event, Failure>(
  declaration: SubscriptionCellDeclaration<Input, Output, Event, Failure>,
  open: (
    input: Input,
  ) => Promise<CellOutcome<SubscriptionSession<Output, Event>, Failure>>,
): SubscriptionCellDefinition<Input, Output, Event, Failure> =>
  Object.freeze({ ...declaration, open });

export const defineSubscriptionCell = <Input, Output, Event, Failure>(
  definition: SubscriptionCellInput<Input, Output, Event, Failure>,
): SubscriptionCellDefinition<Input, Output, Event, Failure> => {
  const { open, ...declaration } = definition;
  return bindSubscriptionCell(declareSubscriptionCell(declaration), open);
};
