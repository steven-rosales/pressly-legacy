import type { ListHistoryPlansInput } from '@pressly/production-system/operations/history/list-plans/types';

// The matrix is permanent target conformance: it retains the characterized
// filters, cursor, projection, and failure behavior.

export type ListHistoryPlansScenario =
  | Readonly<{
      name: string;
      kind: 'requests';
      requests: readonly ListHistoryPlansInput[];
    }>
  | Readonly<{
      name: string;
      kind: 'paginate';
      input: Omit<ListHistoryPlansInput, 'cursor'>;
    }>
  | Readonly<{
      name: string;
      kind: 'cursor-scope-mismatch';
      first: Omit<ListHistoryPlansInput, 'cursor'>;
      mismatched: Omit<ListHistoryPlansInput, 'cursor'>;
    }>;

export type CanonicalListHistoryPlansFailure = Readonly<{
  tag: string | null;
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalListHistoryPlansOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalListHistoryPlansFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalListHistoryPlansFailure;
    }>;

export type ListHistoryPlansReadState = Readonly<{
  scheduleRunCount: number;
  productionRunCount: number;
  locationLiveRevision: number;
}>;

export type ListHistoryPlansObservation = Readonly<{
  outcome: readonly CanonicalListHistoryPlansOutcome[];
  stateDelta: Readonly<{
    before: ListHistoryPlansReadState;
    after: ListHistoryPlansReadState;
  }>;
}>;

export const listHistoryPlansFixtureIds = Object.freeze({
  actor: '30000000-0000-4000-8000-000000000001',
  oldestShift: '30000000-0000-4000-8000-000000000002',
  middleShift: '30000000-0000-4000-8000-000000000003',
  newestShift: '30000000-0000-4000-8000-000000000004',
  siblingShift: '30000000-0000-4000-8000-000000000005',
  config: '30000000-0000-4000-8000-000000000006',
  siblingConfig: '30000000-0000-4000-8000-000000000007',
  oldestPlan: '30000000-0000-4000-8000-000000000008',
  middlePlan: '30000000-0000-4000-8000-000000000009',
  newestPlan: '30000000-0000-4000-8000-000000000010',
  siblingPlan: '30000000-0000-4000-8000-000000000011',
  run: '30000000-0000-4000-8000-000000000012',
});

export const listHistoryPlansLocationId = 'location-history-conformance';
export const listHistoryPlansSiblingLocationId =
  'location-history-conformance-sibling';
export const listHistoryPlansAsOf = new Date('2026-08-21T20:00:00.000Z');

export const listHistoryPlansScenarios: readonly ListHistoryPlansScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'defaults preserve complete projection and descending order',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: listHistoryPlansLocationId,
          limit: 50,
        },
      ]),
    }),
    Object.freeze({
      name: 'run search status and created-after filters select identically',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: listHistoryPlansLocationId,
          runId: listHistoryPlansFixtureIds.run,
          limit: 50,
        },
        {
          locationId: listHistoryPlansLocationId,
          search: 'PRECISION-MIDDLE',
          limit: 50,
        },
        {
          locationId: listHistoryPlansLocationId,
          status: 'accepted' as const,
          limit: 50,
        },
        {
          locationId: listHistoryPlansLocationId,
          createdAfter: new Date('2026-08-21T19:45:00.000Z'),
          limit: 50,
        },
      ]),
    }),
    Object.freeze({
      name: 'cursor bytes paginate exact microsecond order without gaps',
      kind: 'paginate' as const,
      input: Object.freeze({
        locationId: listHistoryPlansLocationId,
        limit: 1,
      }),
    }),
    Object.freeze({
      name: 'cursor remains bound to the complete filter scope',
      kind: 'cursor-scope-mismatch' as const,
      first: Object.freeze({
        locationId: listHistoryPlansLocationId,
        limit: 1,
      }),
      mismatched: Object.freeze({
        locationId: listHistoryPlansLocationId,
        status: 'accepted' as const,
        limit: 1,
      }),
    }),
    Object.freeze({
      name: 'invalid cursor precedence and missing location failures match',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: 'missing-location',
          cursor: 'not-a-valid-cursor',
          limit: 50,
        },
        {
          locationId: 'missing-location',
          limit: 50,
        },
      ]),
    }),
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

const nullableString = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const canonicalFailure = (value: unknown): CanonicalListHistoryPlansFailure => {
  const fields = record(value);
  return Object.freeze({
    tag: nullableString(fields, 'tag'),
    kind: nullableString(fields, 'kind') ?? 'unknown',
    classification: nullableString(fields, 'classification'),
    code: nullableString(fields, 'code') ?? 'unknown_error',
    message:
      value instanceof Error
        ? value.message
        : (nullableString(fields, 'message') ?? 'Unknown error.'),
    safeMessage: nullableString(fields, 'safeMessage'),
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  });
};

export const captureListHistoryPlansOutcome = async (
  execute: (input: ListHistoryPlansInput) => Promise<unknown>,
  input: ListHistoryPlansInput,
): Promise<CanonicalListHistoryPlansOutcome> => {
  try {
    const raw = await execute(input);
    const result = record(raw);
    if (result?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(result['error']),
      });
    if (result?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(result['failure']),
      });
    const value =
      result?.['tag'] === 'ok' || result?.['kind'] === 'success'
        ? result['value']
        : raw;
    return Object.freeze({ kind: 'success', value: canonicalize(value) });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

const nextCursor = (
  outcome: CanonicalListHistoryPlansOutcome,
): string | null => {
  if (outcome.kind !== 'success') return null;
  const value = record(outcome.value);
  const cursor = value?.['nextCursor'];
  return typeof cursor === 'string' ? cursor : null;
};

export const runListHistoryPlansScenario = async (
  execute: (input: ListHistoryPlansInput) => Promise<unknown>,
  scenario: ListHistoryPlansScenario,
): Promise<readonly CanonicalListHistoryPlansOutcome[]> => {
  if (scenario.kind === 'requests') {
    const outcomes: CanonicalListHistoryPlansOutcome[] = [];
    for (const request of scenario.requests)
      outcomes.push(await captureListHistoryPlansOutcome(execute, request));
    return Object.freeze(outcomes);
  }

  if (scenario.kind === 'cursor-scope-mismatch') {
    const first = await captureListHistoryPlansOutcome(execute, scenario.first);
    const cursor = nextCursor(first);
    if (cursor === null)
      return Object.freeze([
        first,
        Object.freeze({
          kind: 'unexpected' as const,
          error: canonicalFailure({
            kind: 'invalid_fixture',
            code: 'missing_history_plans_cursor',
            message: 'The first history-plan page did not return a cursor.',
          }),
        }),
      ]);
    return Object.freeze([
      first,
      await captureListHistoryPlansOutcome(execute, {
        ...scenario.mismatched,
        cursor,
      }),
    ]);
  }

  const outcomes: CanonicalListHistoryPlansOutcome[] = [];
  let cursor: string | undefined;
  do {
    const outcome = await captureListHistoryPlansOutcome(execute, {
      ...scenario.input,
      ...(cursor === undefined ? {} : { cursor }),
    });
    outcomes.push(outcome);
    cursor = nextCursor(outcome) ?? undefined;
  } while (cursor !== undefined);
  return Object.freeze(outcomes);
};
