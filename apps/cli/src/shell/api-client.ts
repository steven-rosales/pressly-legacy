import {
  err,
  makeAppError,
  ok,
  validationError,
  type AppError,
  type Result,
} from '@pressly/errors';

type ApiSuccess<T> = Readonly<{
  ok: true;
  data: T;
}>;

type ApiFailure = Readonly<{
  ok: false;
  error: Readonly<{
    code: string;
    message: string;
    traceId?: string;
    details?: unknown;
  }>;
}>;

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type ApiClientEnv = NodeJS.ProcessEnv;

export const readApiUrl = (env: ApiClientEnv): Result<URL, AppError> => {
  const raw = env['PRESSLY_API_URL']?.trim() || 'http://localhost:4000';

  try {
    return ok(new URL(raw));
  } catch {
    return err(
      validationError({
        code: 'invalid_api_url',
        message: `Invalid PRESSLY_API_URL: ${raw}.`,
        safeMessage: 'PRESSLY_API_URL must be a valid URL.',
        details: { value: raw },
      }),
    );
  }
};

const statusToKind = (status: number): AppError['kind'] => {
  if (status === 401 || status === 403) return 'PermissionError';
  if (status === 404) return 'NotFoundError';
  if (status === 409) return 'ConflictError';
  if (status === 429) return 'RateLimitError';
  if (status >= 500) return 'ExternalServiceError';

  return 'ValidationError';
};

const statusToHttpStatus = (status: number): AppError['status'] => {
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 422 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503
  )
    return status;

  return status >= 500 ? 502 : 400;
};

const isApiResponse = <T>(value: unknown): value is ApiResponse<T> => {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as { ok?: unknown };
  return candidate.ok === true || candidate.ok === false;
};

const apiFailureToError = (response: Response, failure: ApiFailure): AppError =>
  makeAppError({
    kind: statusToKind(response.status),
    code: failure.error.code,
    message: failure.error.message,
    safeMessage: failure.error.message,
    status: statusToHttpStatus(response.status),
    ...(failure.error.details === undefined
      ? {}
      : { details: failure.error.details }),
    ...(failure.error.traceId === undefined
      ? {}
      : { traceId: failure.error.traceId }),
  });

export const requestApi = async <T>(input: {
  apiUrl: URL;
  path: string;
  method: 'GET' | 'POST';
  bearerToken?: string;
  body?: unknown;
}): Promise<Result<T, AppError>> => {
  const url = new URL(input.path, input.apiUrl);

  let response: Response;

  try {
    response = await fetch(url, {
      method: input.method,
      headers: {
        accept: 'application/json',
        ...(input.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...(input.bearerToken === undefined
          ? {}
          : { authorization: `Bearer ${input.bearerToken}` }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
  } catch (cause) {
    return err(
      makeAppError({
        kind: 'ExternalServiceError',
        code: 'api_request_failed',
        message: `Could not reach API at ${url.toString()}.`,
        safeMessage: 'Could not reach the Pressly API.',
        status: 502,
        cause,
      }),
    );
  }

  const body = (await response.json().catch(() => undefined)) as unknown;

  if (!isApiResponse<T>(body))
    return err(
      makeAppError({
        kind: 'ExternalServiceError',
        code: 'invalid_api_response',
        message: `API returned an invalid response for ${url.toString()}.`,
        safeMessage: 'Pressly API returned an invalid response.',
        status: 502,
        details: { status: response.status },
      }),
    );

  if (!body.ok) return err(apiFailureToError(response, body));

  return ok(body.data);
};
