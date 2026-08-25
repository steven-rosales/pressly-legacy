import type {
  ContractIssue,
  EventStreamFrame,
  ExecutableEventStreamCatalog,
  HttpInvalidRequestDescriptor,
  HttpRequest,
  HttpRequestHead,
  HttpRequestValidationLocation,
  HttpResponse,
  SubscriptionSession,
} from '@pressly/cells';
import {
  invariantViolationError,
  validationError,
} from '@pressly/errors/factories';
import type { Request, RequestHandler, Response, Router } from 'express';
import { setHttpResponseHeaders } from './response-headers.ts';

type EventStreamCatalogEntry = ExecutableEventStreamCatalog['entries'][number];

export type EventStreamHostOperation = Readonly<{
  operationId: string;
  observability: string;
  method: 'GET';
  path: string;
  authentication: 'none' | 'required';
  authorization: Readonly<{
    capability: string;
    timing: 'after-input' | 'before-input';
  }> | null;
}>;

export type EventStreamHostMetrics = Readonly<{
  connection: (outcome: 'closed' | 'opened') => void;
  activeConnections: (count: number) => void;
  event: (type: string) => void;
  failure: (
    reason: 'invalid_frame' | 'session_close' | 'source_error' | 'write_error',
  ) => void;
}>;

export type EventStreamHostDependencies = Readonly<{
  requestContext: (operation: EventStreamHostOperation) => RequestHandler;
  authentication: (
    input: Readonly<{
      operation: EventStreamHostOperation;
      required: boolean;
    }>,
  ) => RequestHandler;
  readCellContext: (request: Request, response: Response) => unknown;
  authorize: (
    input: Readonly<{
      operation: EventStreamHostOperation;
      request: Request;
      response: Response;
      capability: string;
      scope: string;
    }>,
  ) => Promise<void> | void;
  sessionExpiresAt: (request: Request, response: Response) => number | null;
  metrics: EventStreamHostMetrics;
  now?: () => number;
  heartbeatIntervalMs?: number;
  reauthorizeIntervalMs?: number;
}>;

export type EventStreamCatalogRouter = Pick<Router, 'get'>;

const operationFrom = (
  entry: EventStreamCatalogEntry,
): EventStreamHostOperation => ({
  operationId: entry.operationId,
  observability: entry.cell.observability.operation,
  method: 'GET',
  path: entry.surface.path,
  authentication: entry.cell.authentication,
  authorization:
    entry.authorization === null
      ? null
      : {
          capability: entry.authorization.capability,
          timing: entry.authorization.timing,
        },
});

const requestHeaders = (
  request: Request,
): Readonly<Record<string, string | undefined>> =>
  Object.fromEntries(
    Object.entries(request.headers).map(
      ([name, value]): [string, string | undefined] => [
        name,
        value === undefined
          ? undefined
          : Array.isArray(value)
            ? value.join(', ')
            : String(value),
      ],
    ),
  );

const requestHead = (request: Request): HttpRequestHead => ({
  params: Object.fromEntries(
    Object.entries(request.params).map(
      ([name, value]): [string, string | undefined] => [
        name,
        typeof value === 'string' ? value : undefined,
      ],
    ),
  ),
  query: request.query,
  headers: requestHeaders(request),
});

const streamRequest = (request: Request, context: unknown): HttpRequest => ({
  ...requestHead(request),
  body: undefined,
  context,
});

const publicValidationIssues = (
  location: HttpRequestValidationLocation,
  issues: readonly ContractIssue[],
) =>
  issues.map((issue) => ({
    path: (issue.path[0] === location ? issue.path.slice(1) : issue.path)
      .map(String)
      .join('.'),
    message: issue.message,
  }));

const declaredInvalidRequest = (
  descriptor: HttpInvalidRequestDescriptor,
  issues: readonly ContractIssue[],
) =>
  validationError({
    code: descriptor.code,
    message: descriptor.message,
    ...(descriptor.safeMessage === undefined
      ? {}
      : { safeMessage: descriptor.safeMessage }),
    ...(descriptor.status === undefined ? {} : { status: descriptor.status }),
    publicDetails: {
      location: descriptor.location,
      issues: publicValidationIssues(descriptor.location, issues),
    },
  });

const invalidInput = (
  entry: EventStreamCatalogEntry,
  issues: readonly ContractIssue[],
) => {
  const descriptor = entry.surface.invalidRequest.input;
  return descriptor === null
    ? validationError({
        code: 'event_stream_cell_input_invalid',
        message: `Input decoding failed for subscription "${entry.operationId}".`,
        safeMessage: 'Invalid request input.',
        details: { operationId: entry.operationId, issues },
      })
    : declaredInvalidRequest(descriptor, issues);
};

const invalidAuthorizationScope = (
  entry: EventStreamCatalogEntry,
  issues: readonly ContractIssue[],
) => {
  const descriptor = entry.surface.invalidRequest.authorizationScope;
  return descriptor === null
    ? validationError({
        code: 'event_stream_cell_authorization_scope_invalid',
        message: `Authorization scope decoding failed for subscription "${entry.operationId}".`,
        safeMessage: 'Invalid request scope.',
        details: { operationId: entry.operationId, issues },
      })
    : declaredInvalidRequest(descriptor, issues);
};

const missingAuthorizationScope = (entry: EventStreamCatalogEntry) =>
  invariantViolationError({
    code: 'event_stream_cell_authorization_scope_missing',
    message: `Subscription "${entry.operationId}" reached authorization without its decoded scope.`,
    details: { operationId: entry.operationId },
  });

const invalidFrame = (
  entry: EventStreamCatalogEntry,
  frame: EventStreamFrame,
) =>
  invariantViolationError({
    code: 'event_stream_cell_frame_invalid',
    message: `Subscription "${entry.operationId}" presented an invalid event-stream frame.`,
    details: { operationId: entry.operationId, frame },
  });

const validatedFrame = (
  entry: EventStreamCatalogEntry,
  frame: EventStreamFrame,
): Readonly<{ chunk: string; type: string }> => {
  const data = JSON.stringify(frame.data);
  if (
    !entry.surface.eventTypes.includes(frame.event) ||
    !/^[A-Za-z0-9_-]+$/.test(frame.event) ||
    data === undefined ||
    (frame.id !== undefined && /[\r\n\0]/.test(frame.id))
  )
    throw invalidFrame(entry, frame);

  return {
    chunk: `${frame.id === undefined ? '' : `id: ${frame.id}\n`}event: ${frame.event}\ndata: ${data}\n\n`,
    type: frame.event,
  };
};

const invalidFailureResponse = (
  entry: EventStreamCatalogEntry,
  response: HttpResponse,
) =>
  invariantViolationError({
    code: 'event_stream_cell_failure_response_invalid',
    message: `Subscription "${entry.operationId}" presented invalid HTTP status "${String(response.status)}".`,
    details: { operationId: entry.operationId, response },
  });

const sendFailure = (
  entry: EventStreamCatalogEntry,
  response: Response,
  presented: HttpResponse,
): void => {
  if (
    !Number.isInteger(presented.status) ||
    presented.status < 100 ||
    presented.status > 599
  )
    throw invalidFailureResponse(entry, presented);

  response.status(presented.status);
  if (presented.headers !== undefined)
    setHttpResponseHeaders(response, presented.headers);
  if (presented.body === undefined) response.end();
  else response.send(presented.body);
};

const authorizationScopeHandler =
  (
    entry: EventStreamCatalogEntry,
    scopes: WeakMap<Request, string>,
  ): RequestHandler =>
  (request, _response, next): void => {
    const authorization = entry.authorization;
    if (authorization === null || authorization.timing !== 'before-input') {
      next();
      return;
    }

    const decoded = authorization.decodeScope(requestHead(request));
    if (decoded.kind === 'invalid')
      throw invalidAuthorizationScope(entry, decoded.issues);

    scopes.set(request, decoded.value);
    next();
  };

const authorizationHandler =
  (
    entry: EventStreamCatalogEntry,
    operation: EventStreamHostOperation,
    dependencies: EventStreamHostDependencies,
    scopes: WeakMap<Request, string>,
  ): RequestHandler =>
  async (request, response, next): Promise<void> => {
    const authorization = entry.authorization;
    if (authorization === null || authorization.timing !== 'before-input') {
      next();
      return;
    }

    const scope = scopes.get(request);
    if (scope === undefined) throw missingAuthorizationScope(entry);
    await dependencies.authorize({
      operation,
      request,
      response,
      capability: authorization.capability,
      scope,
    });
    if (!response.writableEnded && !response.destroyed) next();
  };

const streamHandler =
  (
    entry: EventStreamCatalogEntry,
    operation: EventStreamHostOperation,
    dependencies: EventStreamHostDependencies,
    active: Readonly<{
      increment: () => number;
      decrement: () => number;
    }>,
  ): RequestHandler =>
  async (request, response): Promise<void> => {
    let closed = false;
    let counted = false;
    let session: SubscriptionSession<unknown, unknown> | null = null;
    let detach = (): void => undefined;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let reauthorize: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      if (heartbeat !== null) clearInterval(heartbeat);
      if (reauthorize !== null) clearTimeout(reauthorize);
      detach();
      if (session !== null)
        void Promise.resolve(session.close()).catch(() =>
          dependencies.metrics.failure('session_close'),
        );
      if (!counted) return;
      counted = false;
      dependencies.metrics.connection('closed');
      dependencies.metrics.activeConnections(active.decrement());
    };

    const end = (): void => {
      if (!response.writableEnded && !response.destroyed) response.end();
      cleanup();
    };

    response.once('close', cleanup);
    response.once('finish', cleanup);
    response.once('error', cleanup);
    request.once('aborted', cleanup);

    const context = dependencies.readCellContext(request, response);
    const decoded = entry.decodeRequest(streamRequest(request, context));
    if (decoded.kind === 'invalid') throw invalidInput(entry, decoded.issues);

    const authorization = entry.authorization;
    if (authorization?.timing === 'after-input') {
      await dependencies.authorize({
        operation,
        request,
        response,
        capability: authorization.capability,
        scope: authorization.resolveScope(decoded.value),
      });
      if (response.writableEnded || response.destroyed) {
        cleanup();
        return;
      }
    }

    let outcome;
    try {
      outcome = await entry.open(decoded.value);
    } catch (error: unknown) {
      cleanup();
      throw error;
    }

    if (outcome.kind === 'failure') {
      cleanup();
      sendFailure(entry, response, entry.presentFailure(outcome.failure));
      return;
    }

    session = outcome.value;
    if (closed) {
      void Promise.resolve(session.close()).catch(() =>
        dependencies.metrics.failure('session_close'),
      );
      return;
    }

    const write = (chunk: string): boolean => {
      if (closed) return false;
      try {
        // Node's writable response owns its bounded socket buffer. Preserve
        // the deployed route's behavior when it reports backpressure: writes
        // remain ordered and lifecycle cleanup still comes from close, abort,
        // error, expiry, or source shutdown.
        response.write(chunk);
        return true;
      } catch {
        dependencies.metrics.failure('write_error');
        end();
        return false;
      }
    };

    const ready = validatedFrame(entry, entry.presentReady(session.ready));
    const staged: Readonly<{ chunk: string; type: string }>[] = [];
    let streamStarted = false;
    const sourceState: {
      completed: boolean;
      failure: Readonly<{ error: unknown }> | null;
    } = { completed: false, failure: null };

    const emit = (event: unknown): void => {
      if (closed) return;
      try {
        const presented = validatedFrame(entry, entry.presentEvent(event));
        if (!streamStarted) {
          staged.push(presented);
          return;
        }
        if (write(presented.chunk)) dependencies.metrics.event(presented.type);
      } catch (error: unknown) {
        dependencies.metrics.failure('invalid_frame');
        if (!streamStarted) sourceState.failure = { error };
        else end();
      }
    };

    // Attach before committing SSE headers. A source that shut down while the
    // initial revision was loading must end the ordinary response without a
    // synthetic ready frame. A bounded cell session may synchronously replay
    // its race-closing event here; the host stages that frame behind ready.
    const actualDetach = session.subscribe({
      next: emit,
      close: () => {
        if (!streamStarted) sourceState.completed = true;
        else end();
      },
      error: (error) => {
        dependencies.metrics.failure('source_error');
        if (!streamStarted) sourceState.failure = { error };
        else end();
      },
    });
    detach = actualDetach;

    if (sourceState.failure !== null) {
      cleanup();
      throw sourceState.failure.error;
    }
    if (sourceState.completed) {
      response.end();
      cleanup();
      return;
    }
    if (closed) {
      actualDetach();
      return;
    }

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader(
      'Cache-Control',
      'no-store, no-cache, private, no-transform',
    );
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    counted = true;
    dependencies.metrics.connection('opened');
    dependencies.metrics.activeConnections(active.increment());

    if (!write(`retry: ${entry.surface.retryMs}\n\n`)) return;
    if (!write(ready.chunk)) return;
    dependencies.metrics.event(ready.type);
    streamStarted = true;
    for (const presented of staged)
      if (write(presented.chunk)) dependencies.metrics.event(presented.type);
    if (closed) return;

    const heartbeatIntervalMs = dependencies.heartbeatIntervalMs ?? 20_000;
    heartbeat = setInterval(() => {
      if (!closed) write(': heartbeat\n\n');
    }, heartbeatIntervalMs);
    heartbeat.unref();

    const reauthorizeIntervalMs =
      dependencies.reauthorizeIntervalMs ?? 5 * 60_000;
    const absoluteExpiry = dependencies.sessionExpiresAt(request, response);
    const untilExpiry =
      absoluteExpiry === null
        ? reauthorizeIntervalMs
        : Math.max(1, absoluteExpiry - (dependencies.now ?? Date.now)());
    reauthorize = setTimeout(end, Math.min(reauthorizeIntervalMs, untilExpiry));
    reauthorize.unref();
  };

export const mountEventStreamCatalog = (
  input: Readonly<{
    router: EventStreamCatalogRouter;
    catalog: ExecutableEventStreamCatalog;
    dependencies: EventStreamHostDependencies;
  }>,
): Readonly<{ routeCount: number }> => {
  let activeConnections = 0;
  const active = {
    increment: (): number => {
      activeConnections += 1;
      return activeConnections;
    },
    decrement: (): number => {
      activeConnections = Math.max(0, activeConnections - 1);
      return activeConnections;
    },
  };

  for (const entry of input.catalog.entries) {
    const operation = operationFrom(entry);
    const scopes = new WeakMap<Request, string>();
    const handlers: RequestHandler[] = [
      input.dependencies.requestContext(operation),
      input.dependencies.authentication({
        operation,
        required: operation.authentication === 'required',
      }),
    ];

    if (entry.authorization?.timing === 'before-input') {
      handlers.push(authorizationScopeHandler(entry, scopes));
      handlers.push(
        authorizationHandler(entry, operation, input.dependencies, scopes),
      );
    }

    handlers.push(streamHandler(entry, operation, input.dependencies, active));
    input.router.get(entry.surface.path, ...handlers);
  }

  return Object.freeze({ routeCount: input.catalog.entries.length });
};
