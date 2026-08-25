import type { HttpRequest, HttpRequestInput } from '@pressly/cells';
import {
  authError,
  invariantViolationError,
  validationError,
} from '@pressly/errors/factories';
import type { z } from 'zod';
import {
  principalContextSchema,
  requestMetadataSchema,
  type PrincipalContext,
} from './schemas.ts';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validationFailure = (
  location: 'body' | 'params',
  error: z.ZodError,
): never => {
  throw validationError({
    code: `invalid_${location}_type`,
    message: `Validation ${location} failed.`,
    publicDetails: {
      location,
      issues: error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  });
};

export const validateBody =
  (schema: z.ZodType) =>
  (request: HttpRequestInput): undefined => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) validationFailure('body', parsed.error);
    return undefined;
  };

export const validateParams =
  (schema: z.ZodType) =>
  (request: HttpRequestInput): undefined => {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) validationFailure('params', parsed.error);
    return undefined;
  };

export const parsedBody = <Value extends object>(
  request: HttpRequest,
  schema: z.ZodType<Value>,
): Value => {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) validationFailure('body', parsed.error);
  if (parsed.data === undefined)
    throw invariantViolationError({
      code: 'customer_auth_body_parser_returned_undefined',
      message: 'A successful body schema parse returned undefined.',
      safeMessage: 'The request could not be completed.',
    });
  return parsed.data;
};

export const parsedParams = <Value extends object>(
  request: HttpRequest,
  schema: z.ZodType<Value>,
): Value => {
  const parsed = schema.safeParse(request.params);
  if (!parsed.success) validationFailure('params', parsed.error);
  if (parsed.data === undefined)
    throw invariantViolationError({
      code: 'customer_auth_params_parser_returned_undefined',
      message: 'A successful params schema parse returned undefined.',
      safeMessage: 'The request could not be completed.',
    });
  return parsed.data;
};

export const requestMetadata = (
  request: HttpRequest,
): Readonly<{
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}> => {
  if (!isRecord(request.context)) return {};
  const parsed = requestMetadataSchema.safeParse(
    request.context['requestMetadata'],
  );
  if (!parsed.success) return {};
  return {
    ...(parsed.data.ipAddress === undefined
      ? {}
      : { ipAddress: parsed.data.ipAddress }),
    ...(parsed.data.userAgent === undefined
      ? {}
      : { userAgent: parsed.data.userAgent }),
    ...(parsed.data.requestId === undefined
      ? {}
      : { requestId: parsed.data.requestId }),
  };
};

export const principalContext = (request: HttpRequest): PrincipalContext => {
  const parsed = principalContextSchema.safeParse(
    isRecord(request.context) ? request.context['principal'] : undefined,
  );
  if (parsed.success) return parsed.data;

  throw authError({
    code: 'authenticated_principal_context_missing',
    message: 'Authenticated principal context was not provided.',
    safeMessage: 'Authentication is required.',
  });
};

export const bearerToken = (request: HttpRequest): string => {
  const authorization = request.headers['authorization'];
  if (authorization !== undefined) {
    const [scheme, token] = authorization.split(' ');
    if (scheme === 'Bearer' && token !== undefined && token.trim() !== '')
      return token;
  }

  throw authError({
    code: 'missing_bearer_token',
    message: 'Bearer token is required.',
    safeMessage: 'Authentication is required.',
  });
};

export const requestId = (request: HttpRequest): string | undefined =>
  requestMetadata(request).requestId;
