import {
  decode,
  http,
  type CellOutcome,
  type ContractIssue,
  type DecodeResult,
  type HttpRequest,
  type HttpRequestHead,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { productionStageParamsSchema } from './boundary.ts';
import {
  authError,
  conflictError,
  notFoundError,
} from '@pressly/errors/factories';
import { advanceStageContract } from './contract.ts';
import type {
  AdvanceStageExpectedFailure,
  AdvanceStageResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const actorIdFromContext = (context: unknown): string => {
  const actorId = isRecord(context) ? context['actorId'] : undefined;
  if (typeof actorId === 'string' && actorId.length > 0) return actorId;

  throw authError({
    code: 'missing_auth_principal',
    message: 'Authenticated principal is missing from request context.',
    safeMessage: 'Authentication is required.',
  });
};

const decodeLocationScope = (head: HttpRequestHead): DecodeResult<string> => {
  const parsed = productionStageParamsSchema.safeParse({
    locationId: head.params['locationId'],
    stageRunId: head.params['stageRunId'],
  });
  if (parsed.success) return decode.valid(parsed.data.locationId);

  const issues: readonly ContractIssue[] = parsed.error.issues.map((issue) => ({
    path: [
      'params',
      ...issue.path.map((segment) =>
        typeof segment === 'string' || typeof segment === 'number'
          ? segment
          : String(segment),
      ),
    ],
    message: issue.message,
  }));
  return decode.invalid(issues);
};

const serializedInput =
  (transition: 'start' | 'complete') =>
  (request: HttpRequest): unknown => ({
    transition,
    params: {
      locationId: request.params['locationId'],
      stageRunId: request.params['stageRunId'],
    },
    body: request.body,
    actorId: actorIdFromContext(request.context),
  });

const presentAdvanceStage = (
  outcome: CellOutcome<AdvanceStageResult, AdvanceStageExpectedFailure>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: advanceStageContract.output.encode(outcome.value),
      },
    };

  const fields = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.safeMessage,
  };
  throw outcome.failure.kind === 'not_found'
    ? notFoundError(fields)
    : conflictError(fields);
};

const advanceStageHttpSurface = (
  transition: 'start' | 'complete',
): HttpSurface<AdvanceStageResult, AdvanceStageExpectedFailure> =>
  http.post({
    path: `/production/locations/:locationId/stages/:stageRunId/${transition}`,
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
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
    decodeAuthorizationScope: decodeLocationScope,
    toSerializedInput: serializedInput(transition),
    present: presentAdvanceStage,
  });

export const advanceStageHttpSurfaces = Object.freeze([
  advanceStageHttpSurface('start'),
  advanceStageHttpSurface('complete'),
]);
