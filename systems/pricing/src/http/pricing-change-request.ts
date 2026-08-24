import type { HttpRequest, HttpRequestInput } from '@pressly/cells';
import { authError, validationError } from '@pressly/errors/factories';
import { pricingChangeRequestSchema } from '../model/pricing-change-contract.ts';
import type { PricingChangeAuthor } from '../model/pricing-change.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const pricingChangeAuthorFromContext = (
  context: unknown,
): PricingChangeAuthor => {
  const author = isRecord(context) ? context['pricingChangeAuthor'] : null;
  if (
    isRecord(author) &&
    typeof author['id'] === 'string' &&
    (author['kind'] === 'human' || author['kind'] === 'service') &&
    typeof author['displayName'] === 'string'
  )
    return {
      id: author['id'],
      kind: author['kind'],
      displayName: author['displayName'],
    };
  throw authError({
    code: 'missing_auth_principal',
    message: 'Authenticated principal is missing from request context.',
    safeMessage: 'Authentication is required.',
  });
};

export const validatedPricingChangeBody = (request: HttpRequestInput) => {
  const parsed = pricingChangeRequestSchema.safeParse(request.body);
  if (parsed.success) return parsed.data;
  throw validationError({
    code: 'invalid_body_type',
    message: 'Validation body failed.',
    safeMessage: 'Invalid request input.',
    publicDetails: {
      location: 'body',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  });
};

export const serializedPricingChangeInput = (request: HttpRequest) => ({
  ...validatedPricingChangeBody(request),
  requestedBy: pricingChangeAuthorFromContext(request.context),
});
