import { jsonObjectSchema } from '@pressly/codec/zod';
import type { CellOutcome, HttpRequest, HttpResponse } from '@pressly/cells';
import {
  authError,
  conflictError,
  invariantViolationError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import { isUtcIso } from '@pressly/time';
import { z } from 'zod';

const utcIsoStringSchema = z
  .string()
  .refine((value): boolean => isUtcIso(value), 'Expected a UTC ISO datetime.');

export const orderManagementLocationParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();

export const orderManagementOrderParamsSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: z.string().uuid(),
  })
  .strict();

export const orderManagementFulfillmentParamsSchema = z
  .object({
    locationId: z.string().min(1),
    fulfillmentId: z.string().uuid(),
  })
  .strict();

export const orderManagementProposalParamsSchema = z
  .object({
    locationId: z.string().min(1),
    proposalId: z.string().uuid(),
  })
  .strict();

export const incomingOrderProposalHttpListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).optional(),
    view: z.enum(['needs_review', 'source_closed']).default('needs_review'),
  })
  .strict();

const reasonNoteSchema = z.string().trim().min(1).max(1_000).nullable();

export const acceptIncomingOrderProposalHttpBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.literal('incoming_order_accepted'),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const rejectIncomingOrderProposalHttpBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.enum([
      'already_handled',
      'duplicate_order',
      'not_pressly_work',
      'manager_rejected',
    ]),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const restoreIncomingOrderProposalHttpBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.literal('source_closure_overridden'),
    reasonNote: reasonNoteSchema,
  })
  .strict();

const directOrderCustomerSchema = z.discriminatedUnion('resolution', [
  z
    .object({
      resolution: z.literal('resolved'),
      userId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      resolution: z.literal('not_provided'),
      userId: z.null(),
    })
    .strict(),
]);

const orderItemInputSchema = z
  .object({
    lineKey: z.string().min(1),
    itemType: z.string().min(1),
    code: z.string().min(1),
    description: z.string().min(1),
    quantity: z.number().nonnegative(),
    unit: z.string().min(1),
    unitPriceCents: z.number().int().nonnegative(),
    totalAmountCents: z.number().int().nonnegative(),
    sourceMetadata: jsonObjectSchema,
  })
  .strict();

const directFulfillmentInputSchema = z
  .object({
    typeCode: z.string().min(1),
    locationId: z.string().min(1),
    estimatedWeightLbs: z.number().positive().nullable(),
    estimatedWeightSource: z.string().min(1).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      (value.estimatedWeightLbs === null) ===
      (value.estimatedWeightSource === null),
    {
      message: 'Weight and provenance must either both exist or both be null.',
    },
  );

export const createOrderHttpBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.enum(['new_customer_order', 'recovery_entry']),
    reasonNote: reasonNoteSchema,
    customer: directOrderCustomerSchema,
    displayNumber: z.string().min(1).nullable(),
    dueAt: utcIsoStringSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    totalAmountCents: z.number().int().nonnegative(),
    balanceDueCents: z.number().int().nonnegative().nullable(),
    items: z.array(orderItemInputSchema),
    fulfillment: directFulfillmentInputSchema,
  })
  .strict();

export const correctOrderHttpBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.enum([
      'customer_correction',
      'manager_correction',
      'source_discrepancy',
    ]),
    reasonNote: reasonNoteSchema,
    expectedOrderVersion: z.number().int().positive(),
    expectedFulfillmentVersion: z.number().int().positive(),
    changes: z
      .object({
        customer: directOrderCustomerSchema.optional(),
        displayNumber: z.string().min(1).nullable().optional(),
        dueAt: utcIsoStringSchema.optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        totalAmountCents: z.number().int().nonnegative().optional(),
        balanceDueCents: z.number().int().nonnegative().nullable().optional(),
        items: z.array(orderItemInputSchema).optional(),
        fulfillment: z
          .object({
            typeCode: z.string().min(1).optional(),
            locationId: z.string().min(1).optional(),
            estimatedWeight: z
              .object({
                lbs: z.number().positive().nullable(),
                source: z.string().min(1).nullable(),
              })
              .strict()
              .refine(
                (value) => (value.lbs === null) === (value.source === null),
                {
                  message:
                    'Weight and provenance must either both exist or both be null.',
                },
              )
              .optional(),
          })
          .strict()
          .refine((value) => Object.keys(value).length > 0, {
            message: 'At least one fulfillment description is required.',
          })
          .optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one descriptive correction is required.',
      }),
  })
  .strict();

export const completeOrderHttpBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    reasonCode: z.enum(['service_completed', 'manager_correction']),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const cancelOrderHttpBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    reasonCode: z.enum([
      'customer_canceled',
      'duplicate_order',
      'created_in_error',
      'manager_correction',
    ]),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const releaseFulfillmentHttpBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedOrderVersion: z.number().int().positive(),
    expectedFulfillmentVersion: z.number().int().positive(),
    reasonCode: z.enum(['ready_for_production', 'manager_override']),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const withdrawFulfillmentHttpBodySchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedOrderVersion: z.number().int().positive(),
    expectedFulfillmentVersion: z.number().int().positive(),
    reasonCode: z.enum([
      'commercial_canceled',
      'production_hold',
      'manager_override',
    ]),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const orderMutationHttpResultSchema = z
  .object({
    orderId: z.string().uuid(),
    fulfillmentId: z.string().uuid(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const incomingOrderProposalDecisionHttpResultSchema =
  z.discriminatedUnion('state', [
    z
      .object({
        proposalId: z.string().uuid(),
        state: z.literal('accepted'),
        version: z.number().int().positive(),
        orderId: z.string().uuid(),
        fulfillmentId: z.string().uuid(),
        replayed: z.boolean(),
      })
      .strict(),
    z
      .object({
        proposalId: z.string().uuid(),
        state: z.literal('rejected'),
        version: z.number().int().positive(),
        orderId: z.null(),
        fulfillmentId: z.null(),
        replayed: z.boolean(),
      })
      .strict(),
  ]);

export const restoreIncomingOrderProposalHttpResultSchema = z
  .object({
    proposalId: z.string().uuid(),
    state: z.literal('restored_pending'),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

const incomingOrderProposalHttpSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    state: z.enum(['pending', 'source_closed', 'restored_pending']),
    source: z.string().min(1),
    externalOrderId: z.string().min(1),
    locationId: z.string().min(1),
    displayNumber: z.string().min(1).nullable(),
    customer: z
      .object({
        displayName: z.string().min(1).nullable(),
        phone: z.string().min(1).nullable(),
        email: z.string().min(1).nullable(),
      })
      .strict()
      .nullable(),
    dueAt: utcIsoStringSchema,
    estimatedWeightLbs: z.number().positive().nullable(),
    sourceReportedAt: utcIsoStringSchema,
    reportedAt: utcIsoStringSchema,
    sourceClosure: z
      .object({
        kind: z.enum(['completed', 'canceled']),
        observedAt: utcIsoStringSchema,
      })
      .strict()
      .nullable(),
    availableActions: z
      .array(z.enum(['accept', 'reject', 'restore']))
      .max(2)
      .refine((actions) => new Set(actions).size === actions.length),
    acceptBlockedReason: z.literal('exact_order_exists').nullable(),
  })
  .strict();

export const incomingOrderProposalListHttpResultSchema = z
  .object({
    items: z.array(incomingOrderProposalHttpSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

type RequestLocation = 'body' | 'params' | 'query';

export const parseOrderManagementRequest = <Value>(
  schema: z.ZodType<Value>,
  value: unknown,
  location: RequestLocation,
): Value => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw validationError({
    code: `invalid_${location}_type`,
    message: `Validation ${location} failed.`,
    publicDetails: {
      location,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  });
};

export const strictOrderManagementOutput = <Value>(
  schema: z.ZodType<Value>,
  value: unknown,
  code: string,
): Value => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code,
    message: 'An Order-management HTTP result violated its contract.',
    safeMessage: 'Order data is inconsistent.',
    cause: parsed.error,
  });
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const orderManagementBusinessId = (request: HttpRequest): string => {
  const value = isRecord(request.context)
    ? request.context['orderManagementBusinessId']
    : undefined;
  if (typeof value === 'string' && value.trim() !== '') return value;
  throw invariantViolationError({
    code: 'order_management_business_context_missing',
    message: 'Order-management business ancestry was not provided.',
    safeMessage: 'The request could not be completed.',
  });
};

export const orderManagementAuditContext = (request: HttpRequest) => {
  const value = isRecord(request.context)
    ? request.context['orderManagementPrincipal']
    : undefined;
  const identityId = isRecord(value) ? value['identityId'] : undefined;
  const kind = isRecord(value) ? value['kind'] : undefined;
  if (
    typeof identityId !== 'string' ||
    identityId.length === 0 ||
    (kind !== 'human' && kind !== 'service')
  )
    throw authError({
      code: 'missing_auth_principal',
      message: 'Authenticated principal is missing from request context.',
      safeMessage: 'Authentication is required.',
    });
  return {
    origin: 'pressly_processor',
    principal: { kind, id: identityId },
  } as const;
};

export const directOrderCustomer = (
  input: z.infer<typeof directOrderCustomerSchema>,
) =>
  input.resolution === 'resolved'
    ? {
        resolution: 'resolved' as const,
        userId: input.userId,
        externalUserId: null,
      }
    : {
        resolution: 'not_provided' as const,
        userId: null,
        externalUserId: null,
      };

type OrderManagementExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found' | 'validation';
  code: string;
  message: string;
}>;

export const presentOrderManagementOutcome = <
  Output,
  Failure extends OrderManagementExpectedFailure,
>(
  outcome: CellOutcome<Output, Failure>,
  input: Readonly<{ status: number; data: (value: Output) => unknown }>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: input.status,
      body: { ok: true, data: input.data(outcome.value) },
    };
  const error = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.message,
  };
  throw outcome.failure.kind === 'validation'
    ? validationError(error)
    : outcome.failure.kind === 'not_found'
      ? notFoundError(error)
      : conflictError(error);
};

export const orderManagementInvalidRequest = Object.freeze({
  body: Object.freeze({
    code: 'invalid_body_type',
    message: 'Validation body failed.',
    location: 'body' as const,
  }),
  params: Object.freeze({
    code: 'invalid_params_type',
    message: 'Validation params failed.',
    location: 'params' as const,
  }),
  query: Object.freeze({
    code: 'invalid_query_type',
    message: 'Validation query failed.',
    location: 'query' as const,
  }),
});

export const orderManagementContextRequirements = Object.freeze({
  principal: 'order-management-principal',
  business: 'order-management-business-id',
});
