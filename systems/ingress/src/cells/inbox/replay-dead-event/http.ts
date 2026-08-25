import {
  decode,
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import {
  deadWebhookEventParamsSchema,
  replayDeadWebhookEventRequestSchema,
} from '../../../contracts/webhook-ingestion-v1.ts';
import type { ReplayDeadWebhookEventResult } from '../../../model/inbox.ts';
import type {
  ReplayDeadEventCommand,
  ReplayDeadEventExpectedFailure,
} from './types.ts';

const commandFrom = (request: HttpRequest): ReplayDeadEventCommand => {
  const body = replayDeadWebhookEventRequestSchema.safeParse(request.body);
  if (!body.success)
    throw validationError({
      code: 'invalid_body_type',
      message: 'Validation body failed.',
      safeMessage: 'Invalid request input.',
      status: 400,
    });
  const params = deadWebhookEventParamsSchema.safeParse(request.params);
  if (!params.success)
    throw validationError({
      code: 'invalid_params_type',
      message: 'Validation params failed.',
      safeMessage: 'Invalid request input.',
      status: 400,
    });
  return params.data;
};

const present = (
  outcome: CellOutcome<
    ReplayDeadWebhookEventResult,
    ReplayDeadEventExpectedFailure
  >,
): HttpResponse => {
  if (outcome.kind === 'success')
    return { status: 200, body: { ok: true, data: outcome.value } };

  const fields = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.safeMessage,
  };
  throw outcome.failure.kind === 'not_found'
    ? notFoundError(fields)
    : conflictError(fields);
};

export const replayDeadEventHttpSurface = http.post<
  ReplayDeadWebhookEventResult,
  ReplayDeadEventExpectedFailure
>({
  path: '/webhook-ingestion/dead-letters/:eventId/replay',
  bodyLimit: '64kb',
  invalidRequest: {
    authorizationScope: {
      code: 'invalid_params_type',
      message: 'Validation params failed.',
      safeMessage: 'Invalid request input.',
      status: 400,
      location: 'params',
    },
    input: {
      code: 'invalid_body_type',
      message: 'Validation body failed.',
      safeMessage: 'Invalid request input.',
      status: 400,
      location: 'body',
    },
  },
  validateRequest: (request) => {
    const parsed = replayDeadWebhookEventRequestSchema.safeParse(request.body);
    if (!parsed.success)
      throw validationError({
        code: 'invalid_body_type',
        message: 'Validation body failed.',
        safeMessage: 'Invalid request input.',
        status: 400,
      });
    return undefined;
  },
  decodeAuthorizationScope: (head) => {
    const parsed = deadWebhookEventParamsSchema.safeParse(head.params);
    return parsed.success
      ? decode.valid('production:operations')
      : decode.invalid(
          parsed.error.issues.map((issue) => ({
            path: ['params', ...issue.path.map(String)],
            message: issue.message,
          })),
        );
  },
  toSerializedInput: commandFrom,
  present,
}) satisfies HttpSurface<
  ReplayDeadWebhookEventResult,
  ReplayDeadEventExpectedFailure
>;
