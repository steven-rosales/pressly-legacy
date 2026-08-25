import { decode, type CellOutcome, type DecodeResult } from './contracts.ts';

export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type HttpRequestHead = Readonly<{
  params: Readonly<Record<string, string | undefined>>;
  query: unknown;
  headers: Readonly<Record<string, string | undefined>>;
}>;

export type HttpRequest = HttpRequestHead &
  Readonly<{
    body: unknown;
    /** Authenticated, host-owned context mapped by the cell boundary. */
    context: unknown;
  }>;

export type HttpRequestInput = HttpRequestHead &
  Readonly<{
    body: unknown;
  }>;

export type HttpResponseHeaderValue = string | readonly string[];

export type HttpResponse = Readonly<{
  status: number;
  headers?: Readonly<Record<string, HttpResponseHeaderValue>>;
  body?: unknown;
}>;

export type EventStreamFrame = Readonly<{
  event: string;
  data: unknown;
  id?: string;
}>;

export type HttpRequestValidationLocation = 'body' | 'params' | 'query';

export type HttpValidationStatus = 400 | 413 | 415 | 422;

export type HttpInvalidRequestDescriptor = Readonly<{
  code: string;
  /** Private diagnostic message retained by the process error boundary. */
  message: string;
  safeMessage?: string;
  status?: HttpValidationStatus;
  /** Request location deliberately exposed with sanitized validation issues. */
  location: HttpRequestValidationLocation;
}>;

export type HttpInvalidRequestManifest = Readonly<{
  authorizationScope: HttpInvalidRequestDescriptor | null;
  input: HttpInvalidRequestDescriptor | null;
}>;

export type HttpSurfaceManifest = Readonly<{
  kind: 'http';
  method: HttpMethod;
  path: string;
  bodyLimit: string | null;
  authorization: 'none' | 'staged';
  contextRequirements: readonly string[];
  invalidRequest: HttpInvalidRequestManifest;
}>;

export type HttpSurface<Output, Failure> = HttpSurfaceManifest &
  Readonly<{
    toSerializedInput: (request: HttpRequest) => unknown;
    validateRequest: ((request: HttpRequestInput) => undefined) | null;
    decodeAuthorizationScope:
      | ((head: HttpRequestHead) => DecodeResult<string>)
      | null;
    present: (outcome: CellOutcome<Output, Failure>) => HttpResponse;
  }>;

export type EventStreamSurfaceManifest = Readonly<{
  kind: 'event-stream';
  method: 'GET';
  path: string;
  retryMs: number;
  authorization: 'none' | 'staged';
  invalidRequest: HttpInvalidRequestManifest;
  /** Static allowlist used to keep emitted event names and metric labels bounded. */
  eventTypes: readonly string[];
}>;

export type EventStreamSurface<Output, Event, Failure> =
  EventStreamSurfaceManifest &
    Readonly<{
      toSerializedInput: (request: HttpRequest) => unknown;
      decodeAuthorizationScope:
        | ((head: HttpRequestHead) => DecodeResult<string>)
        | null;
      presentReady: (output: Output) => EventStreamFrame;
      presentEvent: (event: Event) => EventStreamFrame;
      presentFailure: (failure: Failure) => HttpResponse;
    }>;

export type JobTrigger = 'manual' | 'message' | 'poll' | 'schedule';

export type JobSurfaceManifest = Readonly<{
  kind: 'job';
  id: string;
  trigger: JobTrigger;
  queue: string | null;
  timeoutMs: number | null;
}>;

export type JobFailurePresentation = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
  category?:
    | 'conflict'
    | 'external_service'
    | 'invariant'
    | 'not_found'
    | 'validation';
  status?: number;
}>;

export type JobSurface<Failure = unknown> = JobSurfaceManifest &
  Readonly<{
    toSerializedInput: (payload: unknown) => unknown;
    presentFailure: (failure: Failure) => JobFailurePresentation;
  }>;

export type CliArgumentManifest = Readonly<{
  name: string;
  required: boolean;
  variadic: boolean;
}>;

export type CliOptionManifest = Readonly<{
  name: string;
  short: string | null;
  value: 'boolean' | 'string';
  required: boolean;
  repeatable: boolean;
}>;

export type CliStdinPolicy = Readonly<{
  mode: 'none' | 'optional' | 'required';
  encoding: 'utf8';
  maxBytes: number | null;
  tty: 'allow' | 'forbid' | 'require';
}>;

export type CliPresentationStream = 'none' | 'stderr' | 'stdout';

export type CliOutcomePresentationPolicy = Readonly<{
  stream: CliPresentationStream;
  exitCodes: readonly number[];
}>;

export type CliInvalidInvocationPresentationPolicy = Readonly<{
  stream: CliPresentationStream;
  exitCode: number;
}>;

export type CliPresentationManifest = Readonly<{
  success: CliOutcomePresentationPolicy;
  failure: CliOutcomePresentationPolicy;
  invalidInvocation: CliInvalidInvocationPresentationPolicy;
}>;

export type CliSurfaceManifest = Readonly<{
  kind: 'cli';
  id: string;
  name: readonly [string, ...string[]];
  arguments: readonly CliArgumentManifest[];
  options: readonly CliOptionManifest[];
  stdin: CliStdinPolicy;
  prompt: 'allowed' | 'none';
  contextRequirements: readonly string[];
  capabilityRequirements: readonly string[];
  interactive: CliInteractiveManifest | null;
  presentation: CliPresentationManifest;
}>;

export type CliPromptRequest = Readonly<{
  message: string;
  secret?: boolean;
  defaultValue?: string;
}>;

export type CliPrompt = (request: CliPromptRequest) => Promise<string>;

export type CliInvocation = Readonly<{
  command: Readonly<{
    id: string;
    name: readonly string[];
  }>;
  arguments: Readonly<Record<string, string | readonly string[]>>;
  options: Readonly<Record<string, boolean | string | readonly string[]>>;
  stdin: string | null;
  context: Readonly<Record<string, unknown>>;
  prompt: CliPrompt | null;
  signal: AbortSignal;
}>;

export type CliInvocationFailureCode =
  | 'argument_missing'
  | 'argument_unexpected'
  | 'input_contract_invalid'
  | 'option_missing'
  | 'option_repeated'
  | 'option_unknown'
  | 'option_value_missing'
  | 'option_value_unexpected'
  | 'stdin_required'
  | 'stdin_too_large'
  | 'stdin_tty_forbidden'
  | 'stdin_tty_required';

export type CliInvocationFailure = Readonly<{
  code: CliInvocationFailureCode;
  message: string;
  details?: unknown;
}>;

export type CliPresentation = Readonly<{
  stdout?: string;
  stderr?: string;
  exitCode: number;
}>;

export type CliInteractiveTone = 'default' | 'error' | 'info' | 'warning';

export type CliInteractiveLine = Readonly<{
  text: string;
  tone?: CliInteractiveTone;
}>;

export type CliInteractiveFrame = Readonly<{
  lines: readonly CliInteractiveLine[];
}>;

export type CliInteractiveKey = Readonly<{
  input: string;
  escape: boolean;
}>;

export type CliInteractiveSession = Readonly<{
  render: (frame: CliInteractiveFrame) => Promise<void> | void;
  readKey: (
    input: Readonly<{ signal: AbortSignal }>,
  ) => Promise<CliInteractiveKey>;
}>;

export type CliInteractiveInvocationResult<Output, Failure> =
  | Readonly<{
      kind: 'invalid';
      failure: CliInvocationFailure;
    }>
  | Readonly<{
      kind: 'outcome';
      outcome: CellOutcome<Output, Failure>;
    }>;

export type CliInteractiveManifest = Readonly<{
  exitCodes: readonly number[];
}>;

export type CliInteractiveDriver<Output, Failure> = (
  input: Readonly<{
    invocation: CliInvocation;
    session: CliInteractiveSession;
    invoke: (
      serializedInput?: unknown,
    ) => Promise<CliInteractiveInvocationResult<Output, Failure>>;
  }>,
) => Promise<number>;

export type CliInteractiveSurface<Output, Failure> = CliInteractiveManifest &
  Readonly<{
    when: (invocation: CliInvocation) => boolean;
    drive: CliInteractiveDriver<Output, Failure>;
  }>;

export type CliSurface<Output, Failure> = Omit<
  CliSurfaceManifest,
  'interactive'
> &
  Readonly<{
    interactive: CliInteractiveSurface<Output, Failure> | null;
    toSerializedInput: (
      invocation: CliInvocation,
    ) => Promise<unknown> | unknown;
    present: (
      outcome: CellOutcome<Output, Failure>,
      invocation: CliInvocation,
    ) => CliPresentation;
    presentInvalidInvocation: (
      failure: CliInvocationFailure,
    ) => CliPresentation;
  }>;

export type FiniteCellSurfaceManifest =
  | CliSurfaceManifest
  | HttpSurfaceManifest
  | JobSurfaceManifest;

export type CellSurfaceManifest =
  | FiniteCellSurfaceManifest
  | EventStreamSurfaceManifest;

export type FiniteCellSurface<Output, Failure> =
  | CliSurface<Output, Failure>
  | HttpSurface<Output, Failure>
  | JobSurface<Failure>;

export type CellSurface<Output, Failure> =
  | FiniteCellSurface<Output, Failure>
  | EventStreamSurface<Output, unknown, Failure>;

type HttpSurfaceInput<Output, Failure> = Readonly<{
  path: string;
  bodyLimit?: string;
  invalidRequest?: Readonly<{
    authorizationScope?: HttpInvalidRequestDescriptor;
    input?: HttpInvalidRequestDescriptor;
  }>;
  contextRequirements?: readonly string[];
  validateRequest?: (request: HttpRequestInput) => undefined;
  toSerializedInput: (request: HttpRequest) => unknown;
  decodeAuthorizationScope?: (head: HttpRequestHead) => DecodeResult<string>;
  present: (outcome: CellOutcome<Output, Failure>) => HttpResponse;
}>;

type BoundaryParseResult<Value> =
  | Readonly<{ success: true; data: Value }>
  | Readonly<{
      success: false;
      error: Readonly<{
        issues: readonly Readonly<{
          path: readonly PropertyKey[];
          message: string;
        }>[];
      }>;
    }>;

type ValidatedPathScopeInput<Value> = Readonly<{
  schema: Readonly<{
    safeParse: (input: unknown) => BoundaryParseResult<Value>;
  }>;
  input: (params: HttpRequestHead['params']) => unknown;
  scope: (value: Value) => string;
}>;

const freezeInvalidRequestDescriptor = (
  descriptor: HttpInvalidRequestDescriptor | undefined,
): HttpInvalidRequestDescriptor | null =>
  descriptor === undefined ? null : Object.freeze({ ...descriptor });

const normalizeHttpPath = (path: string): string => {
  const withLeadingSlash = path.trim().startsWith('/')
    ? path.trim()
    : `/${path.trim()}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/$/, '') : collapsed;
};

const defineHttpSurface = <Output, Failure>(
  method: HttpMethod,
  definition: HttpSurfaceInput<Output, Failure>,
): HttpSurface<Output, Failure> =>
  Object.freeze({
    kind: 'http',
    method,
    path: normalizeHttpPath(definition.path),
    bodyLimit: definition.bodyLimit ?? null,
    authorization:
      definition.decodeAuthorizationScope === undefined ? 'none' : 'staged',
    contextRequirements: Object.freeze([
      ...(definition.contextRequirements ?? []),
    ]),
    invalidRequest: Object.freeze({
      authorizationScope: freezeInvalidRequestDescriptor(
        definition.invalidRequest?.authorizationScope,
      ),
      input: freezeInvalidRequestDescriptor(definition.invalidRequest?.input),
    }),
    toSerializedInput: definition.toSerializedInput,
    validateRequest: definition.validateRequest ?? null,
    decodeAuthorizationScope: definition.decodeAuthorizationScope ?? null,
    present: definition.present,
  });

export const http = Object.freeze({
  validatedPathScope:
    <Value>(definition: ValidatedPathScopeInput<Value>) =>
    (request: HttpRequestHead): DecodeResult<string> => {
      const parsed = definition.schema.safeParse(
        definition.input(request.params),
      );
      return parsed.success
        ? decode.valid(definition.scope(parsed.data))
        : decode.invalid(
            parsed.error.issues.map((issue) => ({
              path: issue.path.map(String),
              message: issue.message,
            })),
          );
    },
  delete: <Output, Failure>(
    definition: HttpSurfaceInput<Output, Failure>,
  ): HttpSurface<Output, Failure> => defineHttpSurface('DELETE', definition),
  get: <Output, Failure>(
    definition: HttpSurfaceInput<Output, Failure>,
  ): HttpSurface<Output, Failure> => defineHttpSurface('GET', definition),
  patch: <Output, Failure>(
    definition: HttpSurfaceInput<Output, Failure>,
  ): HttpSurface<Output, Failure> => defineHttpSurface('PATCH', definition),
  post: <Output, Failure>(
    definition: HttpSurfaceInput<Output, Failure>,
  ): HttpSurface<Output, Failure> => defineHttpSurface('POST', definition),
  put: <Output, Failure>(
    definition: HttpSurfaceInput<Output, Failure>,
  ): HttpSurface<Output, Failure> => defineHttpSurface('PUT', definition),
});

type EventStreamSurfaceInput<Output, Event, Failure> = Readonly<{
  path: string;
  retryMs?: number;
  eventTypes: readonly string[];
  invalidRequest?: Readonly<{
    authorizationScope?: HttpInvalidRequestDescriptor;
    input?: HttpInvalidRequestDescriptor;
  }>;
  toSerializedInput: (request: HttpRequest) => unknown;
  decodeAuthorizationScope?: (head: HttpRequestHead) => DecodeResult<string>;
  presentReady: (output: Output) => EventStreamFrame;
  presentEvent: (event: Event) => EventStreamFrame;
  presentFailure: (failure: Failure) => HttpResponse;
}>;

export const eventStream = Object.freeze({
  get: <Output, Event, Failure>(
    definition: EventStreamSurfaceInput<Output, Event, Failure>,
  ): EventStreamSurface<Output, Event, Failure> =>
    Object.freeze({
      kind: 'event-stream',
      method: 'GET',
      path: normalizeHttpPath(definition.path),
      retryMs: definition.retryMs ?? 3_000,
      authorization:
        definition.decodeAuthorizationScope === undefined ? 'none' : 'staged',
      invalidRequest: Object.freeze({
        authorizationScope: freezeInvalidRequestDescriptor(
          definition.invalidRequest?.authorizationScope,
        ),
        input: freezeInvalidRequestDescriptor(definition.invalidRequest?.input),
      }),
      eventTypes: Object.freeze([...new Set(definition.eventTypes)]),
      toSerializedInput: definition.toSerializedInput,
      decodeAuthorizationScope: definition.decodeAuthorizationScope ?? null,
      presentReady: definition.presentReady,
      presentEvent: definition.presentEvent,
      presentFailure: definition.presentFailure,
    }),
});

type JobSurfaceInput<Failure> = Readonly<{
  id: string;
  queue?: string;
  timeoutMs?: number;
  toSerializedInput: (payload: unknown) => unknown;
  presentFailure: (failure: Failure) => JobFailurePresentation;
}>;

const defineJobSurface = <Failure>(
  trigger: JobTrigger,
  definition: JobSurfaceInput<Failure>,
): JobSurface<Failure> =>
  Object.freeze({
    kind: 'job',
    id: definition.id,
    trigger,
    queue: definition.queue ?? null,
    timeoutMs: definition.timeoutMs ?? null,
    toSerializedInput: definition.toSerializedInput,
    presentFailure: definition.presentFailure,
  });

export const job = Object.freeze({
  manual: <Failure>(
    definition: JobSurfaceInput<Failure>,
  ): JobSurface<Failure> => defineJobSurface('manual', definition),
  message: <Failure>(
    definition: JobSurfaceInput<Failure>,
  ): JobSurface<Failure> => defineJobSurface('message', definition),
  poll: <Failure>(definition: JobSurfaceInput<Failure>): JobSurface<Failure> =>
    defineJobSurface('poll', definition),
  schedule: <Failure>(
    definition: JobSurfaceInput<Failure>,
  ): JobSurface<Failure> => defineJobSurface('schedule', definition),
});

type CliSurfaceInput<Output, Failure> = Readonly<{
  id: string;
  name: readonly [string, ...string[]];
  arguments?: readonly CliArgumentManifest[];
  options?: readonly CliOptionManifest[];
  stdin?: CliStdinPolicy;
  prompt?: 'allowed' | 'none';
  contextRequirements?: readonly string[];
  capabilityRequirements?: readonly string[];
  interactive?: Readonly<{
    exitCodes: readonly number[];
    when?: (invocation: CliInvocation) => boolean;
    drive: CliInteractiveDriver<Output, Failure>;
  }>;
  presentation: CliPresentationManifest;
  toSerializedInput: (invocation: CliInvocation) => Promise<unknown> | unknown;
  present: (
    outcome: CellOutcome<Output, Failure>,
    invocation: CliInvocation,
  ) => CliPresentation;
  presentInvalidInvocation: (failure: CliInvocationFailure) => CliPresentation;
}>;

const noCliStdin: CliStdinPolicy = Object.freeze({
  mode: 'none',
  encoding: 'utf8',
  maxBytes: null,
  tty: 'allow',
});

const freezeCliOutcomePresentation = (
  policy: CliOutcomePresentationPolicy,
): CliOutcomePresentationPolicy =>
  Object.freeze({
    stream: policy.stream,
    exitCodes: Object.freeze([...policy.exitCodes]),
  });

const defineCliSurface = <Output, Failure>(
  definition: CliSurfaceInput<Output, Failure>,
): CliSurface<Output, Failure> =>
  Object.freeze({
    kind: 'cli',
    id: definition.id,
    name: Object.freeze([...definition.name]) as readonly [string, ...string[]],
    arguments: Object.freeze(
      (definition.arguments ?? []).map((argument) =>
        Object.freeze({ ...argument }),
      ),
    ),
    options: Object.freeze(
      (definition.options ?? []).map((option) => Object.freeze({ ...option })),
    ),
    stdin: Object.freeze({ ...(definition.stdin ?? noCliStdin) }),
    prompt: definition.prompt ?? 'none',
    contextRequirements: Object.freeze([
      ...(definition.contextRequirements ?? []),
    ]),
    capabilityRequirements: Object.freeze([
      ...(definition.capabilityRequirements ?? []),
    ]),
    interactive:
      definition.interactive === undefined
        ? null
        : Object.freeze({
            exitCodes: Object.freeze([...definition.interactive.exitCodes]),
            when: definition.interactive.when ?? (() => true),
            drive: definition.interactive.drive,
          }),
    presentation: Object.freeze({
      success: freezeCliOutcomePresentation(definition.presentation.success),
      failure: freezeCliOutcomePresentation(definition.presentation.failure),
      invalidInvocation: Object.freeze({
        ...definition.presentation.invalidInvocation,
      }),
    }),
    toSerializedInput: definition.toSerializedInput,
    present: definition.present,
    presentInvalidInvocation: definition.presentInvalidInvocation,
  });

export const cli = Object.freeze({
  command: <Output, Failure>(
    definition: CliSurfaceInput<Output, Failure>,
  ): CliSurface<Output, Failure> => defineCliSurface(definition),
});
