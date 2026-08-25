export const ordersVerificationSurface = Object.freeze({
  id: 'orders.remaining-operations.v1',
});

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/i;

export const normalizeOrdersValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    if (uuid.test(value)) return '<uuid>';
    if (sha256.test(value)) return '<sha256>';
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeOrdersValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['createdAt', 'updatedAt'].includes(key))
      .map(([key, item]) => [key, normalizeOrdersValue(item)]),
  );
};

export const normalizeOrdersOutcome = (outcome: unknown): unknown => {
  if (outcome === null || typeof outcome !== 'object') return outcome;
  if ('kind' in outcome && outcome.kind === 'success' && 'value' in outcome)
    return { kind: 'success', value: normalizeOrdersValue(outcome.value) };
  if ('kind' in outcome && outcome.kind === 'failure' && 'failure' in outcome)
    return {
      kind: 'failure',
      failure: normalizeOrdersValue(outcome.failure),
    };
  return normalizeOrdersValue(outcome);
};

export const ordersOutcomeValue = (
  outcome: unknown,
): Record<string, unknown> => {
  if (outcome === null || typeof outcome !== 'object') return {};
  if (
    'kind' in outcome &&
    outcome.kind === 'success' &&
    'value' in outcome &&
    outcome.value !== null &&
    typeof outcome.value === 'object'
  )
    return outcome.value as Record<string, unknown>;
  return {};
};
