import type { Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { catchAsync } from './catch-async.js';
import {
  invariantViolationError,
  validationError,
} from '@pressly/errors/factories';

type ParseIssue = Readonly<{
  path: readonly PropertyKey[];
  message: string;
}>;

type ParseResult<Output = unknown> =
  | {
      success: true;
      data: Output;
    }
  | {
      success: false;
      error: {
        issues: ParseIssue[];
      };
    };

type RequestSchema<Output = unknown> = {
  safeParseAsync(input: unknown): Promise<ParseResult<Output>>;
};

type SchemaConfig = Readonly<{
  body?: RequestSchema;
  query?: RequestSchema;
  params?: RequestSchema;
}>;

type RequestLocation = keyof SchemaConfig;

type ParsedRequestInput = Readonly<Partial<Record<RequestLocation, unknown>>>;

type RequestBoundaryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | readonly RequestBoundaryValue[]
  | Readonly<{ [key: string]: RequestBoundaryValue }>;

type BoundarySchema = ZodType<RequestBoundaryValue>;

type BoundarySchemaConfig = Readonly<{
  body?: BoundarySchema;
  query?: BoundarySchema;
  params?: BoundarySchema;
}>;

type BoundarySchemaOutput<Schema> =
  Schema extends ZodType<infer Value> ? Value : never;

type RequestBoundaryInput<Schemas extends BoundarySchemaConfig> = Readonly<{
  [Location in keyof Schemas]: BoundarySchemaOutput<Schemas[Location]>;
}>;

type RequestBoundaryContext = Readonly<{
  request: Request;
  response: Response;
}>;

type RequestBoundaryHandler<Schemas extends BoundarySchemaConfig> = (
  input: RequestBoundaryInput<Schemas>,
  context: RequestBoundaryContext,
) => Promise<void> | void;

type RequestBoundary<Schemas extends BoundarySchemaConfig> = Readonly<{
  validate: RequestHandler;
  handler: (handle: RequestBoundaryHandler<Schemas>) => RequestHandler;
}>;

type ValidatedBoundaryInput<Schemas extends BoundarySchemaConfig> = Readonly<{
  input: RequestBoundaryInput<Schemas>;
  fingerprint: string;
}>;

type ValidationIssue = {
  path: string;
  message: string;
};

const mapParseIssues = (issues: ParseIssue[]): ValidationIssue[] =>
  issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));

const requestLocations = ['body', 'query', 'params'] as const;

const requestBoundaryValueError = (reason: string) =>
  invariantViolationError({
    code: 'request_boundary_value_not_canonicalizable',
    message: `A request boundary produced an unsupported value: ${reason}.`,
    safeMessage: 'The request could not be processed.',
  });

const fingerprintValue = (value: unknown, ancestors: Set<object>): unknown => {
  if (value === null) return ['null'];
  if (value === undefined) return ['undefined'];

  if (typeof value === 'string') return ['string', value];
  if (typeof value === 'boolean') return ['boolean', value];
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw requestBoundaryValueError('non-finite number');
    return ['number', Object.is(value, -0) ? '-0' : value];
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()))
      throw requestBoundaryValueError('invalid date');
    return ['date', value.toISOString()];
  }

  if (typeof value !== 'object')
    throw requestBoundaryValueError(`unsupported ${typeof value}`);

  if (ancestors.has(value)) throw requestBoundaryValueError('cyclic structure');

  ancestors.add(value);

  try {
    if (Array.isArray(value))
      return [
        'array',
        Array.from({ length: value.length }, (_, index) =>
          Object.hasOwn(value, index)
            ? fingerprintValue(value[index], ancestors)
            : ['missing'],
        ),
      ];

    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null)
      throw requestBoundaryValueError('non-plain object');

    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string'))
      throw requestBoundaryValueError('symbol-keyed object');

    const entries = (keys as string[]).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !Object.hasOwn(descriptor, 'value')
      )
        throw requestBoundaryValueError('non-data object property');

      return [key, fingerprintValue(descriptor.value, ancestors)];
    });

    return ['object', entries];
  } finally {
    ancestors.delete(value);
  }
};

const requestBoundaryFingerprint = (value: unknown): string =>
  JSON.stringify(fingerprintValue(value, new Set<object>()));

const assignRequestLocation = (
  request: Request,
  location: RequestLocation,
  data: unknown,
): void => {
  if (location === 'query') {
    Object.defineProperty(request, 'query', {
      value: data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return;
  }

  if (location === 'body') {
    request.body = data;
    return;
  }

  request.params = data as Request['params'];
};

const parseRequestInput = async (
  request: Request,
  schemas: SchemaConfig,
): Promise<ParsedRequestInput> => {
  const parsedInput: Partial<Record<RequestLocation, unknown>> = {};

  for (const location of requestLocations) {
    const schema = schemas[location];
    if (schema === undefined) continue;

    const parsed = await schema.safeParseAsync(request[location]);
    if (!parsed.success)
      throw validationError({
        code: `invalid_${location}_type`,
        message: `Validation ${location} failed.`,
        publicDetails: {
          location,
          issues: mapParseIssues(parsed.error.issues),
        },
      });

    parsedInput[location] = parsed.data;
  }

  return Object.freeze(parsedInput);
};

const boundaryInput = <Schemas extends BoundarySchemaConfig>(
  parsedInput: ParsedRequestInput,
): RequestBoundaryInput<Schemas> =>
  Object.freeze(
    Object.fromEntries(
      requestLocations.flatMap((location) => {
        return Object.hasOwn(parsedInput, location)
          ? [[location, parsedInput[location]]]
          : [];
      }),
    ),
  ) as RequestBoundaryInput<Schemas>;

const currentBoundaryInput = <Schemas extends BoundarySchemaConfig>(
  request: Request,
  schemas: Schemas,
): RequestBoundaryInput<Schemas> =>
  boundaryInput(
    Object.freeze(
      Object.fromEntries(
        requestLocations.flatMap((location) =>
          schemas[location] === undefined
            ? []
            : [[location, request[location]]],
        ),
      ),
    ),
  );

const assignParsedInput = (
  request: Request,
  parsedInput: ParsedRequestInput,
): void => {
  for (const location of requestLocations) {
    if (Object.hasOwn(parsedInput, location))
      assignRequestLocation(request, location, parsedInput[location]);
  }
};

export const validateRequest = (schema: SchemaConfig): RequestHandler => {
  return catchAsync(async (req, _, next) => {
    const parsedInput = await parseRequestInput(req, schema);
    assignParsedInput(req, parsedInput);
    next();
  });
};

export const defineRequestBoundary = <
  const Schemas extends BoundarySchemaConfig,
>(
  schemas: Schemas,
): RequestBoundary<Schemas> => {
  const validatedRequests = new WeakMap<
    Request,
    ValidatedBoundaryInput<Schemas>
  >();

  const validate = catchAsync(async (request, _, next) => {
    const parsedInput = await parseRequestInput(request, schemas);
    const input = boundaryInput<Schemas>(parsedInput);

    assignParsedInput(request, parsedInput);

    validatedRequests.set(request, {
      input,
      fingerprint: requestBoundaryFingerprint(input),
    });

    next();
  });

  const handler = (handle: RequestBoundaryHandler<Schemas>): RequestHandler =>
    catchAsync(async (request, response) => {
      const validated = validatedRequests.get(request);

      if (validated === undefined)
        throw invariantViolationError({
          code: 'request_boundary_not_validated',
          message:
            'A request boundary handler ran without its paired validation middleware.',
          safeMessage: 'The request could not be processed.',
        });

      validatedRequests.delete(request);

      if (
        requestBoundaryFingerprint(currentBoundaryInput(request, schemas)) !==
        validated.fingerprint
      )
        throw invariantViolationError({
          code: 'request_boundary_changed_after_validation',
          message:
            'Validated request data changed before its boundary handler ran.',
          safeMessage: 'The request could not be processed.',
        });

      await handle(validated.input, { request, response });
    });

  return Object.freeze({ validate, handler });
};
