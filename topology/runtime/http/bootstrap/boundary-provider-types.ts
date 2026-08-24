import type {
  HttpBoundaryHostOperation,
  HttpBoundaryMiddlewareInput,
} from '@pressly/http/host-boundary';

export type ApiBoundaryRequest = Readonly<{
  method: string;
  path: string;
  ip: string | undefined;
  params: Readonly<Record<string, string | readonly string[] | undefined>>;
  header: (name: string) => string | undefined;
}>;

export type ApiBoundaryResponse = Readonly<{
  destroyed: boolean;
  writableEnded: boolean;
  locals: Record<string, unknown>;
  clearCookie: (
    name: string,
    options: Readonly<{
      httpOnly: boolean;
      sameSite: 'strict';
      secure: boolean;
      path: string;
    }>,
  ) => unknown;
}>;

export type ApiBoundaryNext = (error?: unknown) => void;

export type ApiBoundaryRequestHandler<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = {
  bivarianceHack(
    request: Request,
    response: Response,
    next: ApiBoundaryNext,
  ): unknown;
}['bivarianceHack'];

export type RateLimitStore = Readonly<{
  consume: (
    key: string,
    limit: number,
    windowMs: number,
  ) => Readonly<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAtMs: number;
    retryAfterSeconds: number;
  }>;
}>;

export type ApiHttpBoundaryMiddlewareProvider<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = (
  input: HttpBoundaryMiddlewareInput,
) => ApiBoundaryRequestHandler<Request, Response>;

export type ApiHttpBoundaryContextProvider<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = (input: {
  operation: HttpBoundaryHostOperation;
  request: Request;
  response: Response;
}) =>
  | Promise<Readonly<Record<string, unknown>>>
  | Readonly<Record<string, unknown>>;

export type ApiHttpBoundaryAuthorizationProvider<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = (input: {
  operation: HttpBoundaryHostOperation;
  request: Request;
  response: Response;
  capability: string;
  scope: string;
}) => Promise<void> | void;

export type ApiHttpBoundaryExpectedFailureProvider<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
> = (
  input: Readonly<{
    operation: HttpBoundaryHostOperation;
    request: Request;
    response: Readonly<{
      headersSent: boolean;
      locals: Readonly<Record<string, unknown>>;
    }>;
    failure: unknown;
    status: number;
  }>,
) => Promise<void> | void;
