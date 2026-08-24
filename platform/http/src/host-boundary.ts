import type { HttpBoundaryProfile } from '@pressly/cells';
import type { Request, RequestHandler, Response } from 'express';

export type HttpHostOperation = Readonly<{
  operationId: string;
  observability: string;
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  path: string;
  bodyLimit: string | null;
  authentication: 'none' | 'required';
  contextRequirements: readonly string[];
  authorization: Readonly<{
    capability: string;
    timing: 'after-input' | 'before-input';
  }> | null;
}>;

export type HttpBoundaryHostOperation = HttpHostOperation &
  Readonly<{ boundaryProfileId: string }>;

type HttpBoundaryMiddlewareBase = Readonly<{
  operation: HttpBoundaryHostOperation;
  provider: string;
}>;

export type HttpBoundaryMiddlewareInput =
  | (HttpBoundaryMiddlewareBase &
      Readonly<{ kind: 'authentication'; required: boolean }>)
  | (HttpBoundaryMiddlewareBase &
      Readonly<{
        kind:
          | 'csrf'
          | 'exact-origin'
          | 'identity-rate-limit'
          | 'request-rate-limit';
      }>)
  | (HttpBoundaryMiddlewareBase &
      Readonly<{
        kind: 'request-body-parser';
        acceptedContentTypes: readonly string[];
        contentType: 'parse-if-matching' | 'required';
        limit: string | null;
      }>);

export type HttpExpectedFailureObservationInput = Readonly<{
  operation: HttpBoundaryHostOperation;
  provider: string;
  request: Request;
  response: Readonly<{
    headersSent: boolean;
    locals: Readonly<Record<string, unknown>>;
  }>;
  failure: unknown;
  status: number;
}>;

export type HttpBoundaryHostDependencies = Readonly<{
  requestContext: (operation: HttpBoundaryHostOperation) => RequestHandler;
  middleware: (input: HttpBoundaryMiddlewareInput) => RequestHandler;
  readCellContext: (input: {
    operation: HttpBoundaryHostOperation;
    providers: readonly string[];
    request: Request;
    response: Response;
  }) => Promise<unknown> | unknown;
  authorize: (input: {
    operation: HttpBoundaryHostOperation;
    provider: string;
    request: Request;
    response: Response;
    capability: string;
    scope: string;
  }) => Promise<void> | void;
  observeExpectedFailure?: (
    input: HttpExpectedFailureObservationInput,
  ) => Promise<void> | void;
  observeResponse?: (input: {
    operation: HttpBoundaryHostOperation;
    status: number;
  }) => Promise<void> | void;
}>;

export type HttpBoundaryCatalogEntry = Readonly<{
  operationId: string;
  boundaryProfile?: HttpBoundaryProfile;
}>;
