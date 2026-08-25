import type { Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import {
  invariantViolationError,
  type ValidationErrorStatus,
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
  safeParse(input: unknown): ParseResult<Output>;
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

type InvalidRequestDescriptor = Readonly<{
  code: string;
  message: string;
  safeMessage?: string;
  status?: ValidationErrorStatus;
}>;

type InvalidRequestConfig<Schemas extends BoundarySchemaConfig> = Readonly<
  Partial<
    Record<Extract<keyof Schemas, RequestLocation>, InvalidRequestDescriptor>
  >
>;

type ValidatedControllerHandler<Schemas extends BoundarySchemaConfig> = (
  input: RequestBoundaryInput<Schemas>,
  context: RequestBoundaryContext,
) => Promise<void> | void;

type RequiredRequestLocation<Schemas extends BoundarySchemaConfig> = {
  [Location in RequestLocation]-?: Location extends keyof Schemas
    ? undefined extends Schemas[Location]
      ? never
      : Location
    : never;
}[RequestLocation];

type RequestLocationValidators<Schemas extends BoundarySchemaConfig> = Readonly<
  Record<RequiredRequestLocation<Schemas>, RequestHandler> &
    Partial<
      Record<
        Exclude<RequestLocation, RequiredRequestLocation<Schemas>>,
        RequestHandler
      >
    >
>;

export interface ValidatedController<
  Schemas extends BoundarySchemaConfig = BoundarySchemaConfig,
> {
  readonly validate: RequestHandler;
  readonly validators: RequestLocationValidators<Schemas>;
  readonly handle: RequestHandler;
}

type ValidatedControllerDefinition<Schemas extends BoundarySchemaConfig> =
  Readonly<{
    request: Schemas;
    invalidRequest?: InvalidRequestConfig<Schemas>;
    handle: ValidatedControllerHandler<Schemas>;
  }>;

type ValidatedBoundaryLocation = Readonly<{
  value: unknown;
  fingerprint: string;
}>;

type ValidatedBoundaryState = Readonly<
  Partial<Record<RequestLocation, ValidatedBoundaryLocation>>
>;

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

const requestBoundaryAlreadyValidatedError = (
  locations: readonly RequestLocation[],
) =>
  invariantViolationError({
    code: 'request_boundary_already_validated',
    message: `A request boundary attempted to validate ${locations.join(', ')} more than once.`,
    safeMessage: 'The request could not be processed.',
  });

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

const parseRequestLocation = (
  location: RequestLocation,
  schema: RequestSchema,
  value: unknown,
): ParseResult => {
  try {
    return schema.safeParse(value);
  } catch (cause) {
    throw invariantViolationError({
      code: 'request_schema_evaluation_failed',
      message: `The ${location} request schema did not evaluate synchronously and purely.`,
      safeMessage: 'The request could not be processed.',
      cause,
    });
  }
};

/**
 * The function goes over all schemas for each location (e.g., body, params, query). If successful, then it will return the parsed input record; otherwise it will throw a validation error.
 * @param request The request stream from express
 * @param schemas The schemas that will be used to parse
 * @param invalidRequest The invalid request hash map that stores the data from the error of the location
 * @returns Succesful parsed input
 */
const parseRequestInput = (
  request: Request,
  schemas: SchemaConfig,
  invalidRequest: Readonly<
    Partial<Record<RequestLocation, InvalidRequestDescriptor>>
  >,
): ParsedRequestInput => {
  const parsedInput: Partial<Record<RequestLocation, unknown>> = {};

  for (const location of requestLocations) {
    const schema = schemas[location];
    if (schema === undefined) continue;

    const parsed = parseRequestLocation(location, schema, request[location]);
    if (!parsed.success) {
      const descriptor = invalidRequest[location];
      throw validationError({
        code: descriptor?.code ?? `invalid_${location}_type`,
        message: descriptor?.message ?? `Validation ${location} failed.`,
        ...(descriptor?.safeMessage === undefined
          ? {}
          : { safeMessage: descriptor.safeMessage }),
        ...(descriptor?.status === undefined
          ? {}
          : { status: descriptor.status }),
        publicDetails: {
          location,
          issues: mapParseIssues(parsed.error.issues),
        },
      });
    }

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

const assignParsedInput = (
  request: Request,
  parsedInput: ParsedRequestInput,
): void => {
  for (const location of requestLocations) {
    if (Object.hasOwn(parsedInput, location))
      assignRequestLocation(request, location, parsedInput[location]);
  }
};

export const defineValidatedController = <
  const Schemas extends BoundarySchemaConfig,
>(
  definition: ValidatedControllerDefinition<Schemas>,
): ValidatedController<Schemas> => {
  const schemas = definition.request;
  const invalidRequest = definition.invalidRequest ?? Object.freeze({});
  const validatedRequests = new WeakMap<Request, ValidatedBoundaryState>();

  const recordParsedInput = (
    request: Request,
    parsedInput: ParsedRequestInput,
  ): void => {
    const current = validatedRequests.get(request) ?? Object.freeze({});
    const parsedLocations = requestLocations.filter((location) =>
      Object.hasOwn(parsedInput, location),
    );
    const duplicateLocations = parsedLocations.filter((location) =>
      Object.hasOwn(current, location),
    );

    if (duplicateLocations.length > 0)
      throw requestBoundaryAlreadyValidatedError(duplicateLocations);

    const additions = Object.fromEntries(
      parsedLocations.map((location) => [
        location,
        Object.freeze({
          value: parsedInput[location],
          fingerprint: requestBoundaryFingerprint(parsedInput[location]),
        }),
      ]),
    ) as ValidatedBoundaryState;

    assignParsedInput(request, parsedInput);
    validatedRequests.set(request, Object.freeze({ ...current, ...additions }));
  };

  const validatorFor =
    (requestSchemas: SchemaConfig): RequestHandler =>
    (request, _, next) => {
      recordParsedInput(
        request,
        parseRequestInput(request, requestSchemas, invalidRequest),
      );
      next();
    };

  const validate = validatorFor(schemas);

  const validators = Object.freeze(
    Object.fromEntries(
      requestLocations.flatMap((location) => {
        const schema = schemas[location];
        return schema === undefined
          ? []
          : [[location, validatorFor({ [location]: schema })]];
      }),
    ),
  ) as RequestLocationValidators<Schemas>;

  const handle: RequestHandler = (request, response) => {
    const validated = validatedRequests.get(request);

    if (validated === undefined)
      throw invariantViolationError({
        code: 'request_boundary_not_validated',
        message:
          'A validated controller ran without its paired validation middleware.',
        safeMessage: 'The request could not be processed.',
      });

    validatedRequests.delete(request);

    const configuredLocations = requestLocations.filter(
      (location) => schemas[location] !== undefined,
    );
    if (
      configuredLocations.some((location) => validated[location] === undefined)
    )
      throw invariantViolationError({
        code: 'request_boundary_not_validated',
        message:
          'A validated controller ran before every configured request location was validated.',
        safeMessage: 'The request could not be processed.',
      });

    const changed = configuredLocations.some((location) => {
      const boundaryLocation = validated[location];
      return (
        boundaryLocation === undefined ||
        requestBoundaryFingerprint(request[location]) !==
          boundaryLocation.fingerprint
      );
    });
    if (changed)
      throw invariantViolationError({
        code: 'request_boundary_changed_after_validation',
        message: 'Validated request data changed before its controller ran.',
        safeMessage: 'The request could not be processed.',
      });

    const input = boundaryInput<Schemas>(
      Object.freeze(
        Object.fromEntries(
          configuredLocations.map((location) => [
            location,
            validated[location]?.value,
          ]),
        ),
      ),
    );

    return definition.handle(input, { request, response });
  };

  return Object.freeze({ validate, validators, handle });
};
