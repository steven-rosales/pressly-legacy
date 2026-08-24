import type { ListHistoryActivityInput } from '@pressly/production-system/operations/history/list-activity/types';

export type CanonicalListHistoryActivityFailure = Readonly<{
  tag: string | null;
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalListHistoryActivityOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalListHistoryActivityFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalListHistoryActivityFailure;
    }>;

// Permanent conformance for the current query.
// The characterized scenarios and explicit assertions remain the oracle.
export type ListHistoryActivityConformanceScenario =
  | Readonly<{
      name: string;
      kind: 'requests';
      requests: readonly ListHistoryActivityInput[];
    }>
  | Readonly<{
      name: string;
      kind: 'paginate';
      input: Omit<ListHistoryActivityInput, 'cursor'>;
    }>;

export const listHistoryActivityLocationId =
  'location-history-activity-conformance';
export const listHistoryActivitySiblingLocationId =
  'location-history-activity-conformance-sibling';
export const listHistoryActivityBoundaryLocationId =
  'location-history-activity-conformance-boundary';
export const listHistoryActivityAsOf = new Date('2026-08-22T20:00:00.000Z');

export const listHistoryActivityIds = Object.freeze({
  business: '32000000-0000-4000-8000-000000000001',
  actor: '32000000-0000-4000-8000-000000000002',
  unknownActor: '32000000-0000-4000-8000-000000000003',
  shiftA: '32000000-0000-4000-8000-000000000004',
  shiftB: '32000000-0000-4000-8000-000000000005',
  configA: '32000000-0000-4000-8000-000000000006',
  configB: '32000000-0000-4000-8000-000000000007',
  scheduleA: '32000000-0000-4000-8000-000000000008',
  scheduleB: '32000000-0000-4000-8000-000000000009',
  runA: '32000000-0000-4000-8000-000000000010',
  runB: '32000000-0000-4000-8000-000000000011',
  batchA: '32000000-0000-4000-8000-000000000012',
  batchB: '32000000-0000-4000-8000-000000000013',
  station: '32000000-0000-4000-8000-000000000014',
  stageA: '32000000-0000-4000-8000-000000000015',
  stageB: '32000000-0000-4000-8000-000000000016',
  sourceOrder: '32000000-0000-4000-8000-000000000017',
  fulfillment: '32000000-0000-4000-8000-000000000018',
  demand: '32000000-0000-4000-8000-000000000019',
  order: '32000000-0000-4000-8000-000000000020',
  membershipA: '32000000-0000-4000-8000-000000000021',
  membershipB: '32000000-0000-4000-8000-000000000022',
  runAEvent: '32000000-0000-4000-8000-000000000030',
  batchAEvent: '32000000-0000-4000-8000-000000000031',
  scheduleAEvent: '32000000-0000-4000-8000-000000000032',
  shiftAEvent: '32000000-0000-4000-8000-000000000033',
  demandEvent: '32000000-0000-4000-8000-000000000034',
  orderEvent: '32000000-0000-4000-8000-000000000035',
  stageAEvent: '32000000-0000-4000-8000-000000000036',
  archiveEvent: '32000000-0000-4000-8000-000000000037',
  bulkArchiveEvent: '32000000-0000-4000-8000-000000000038',
  restoreEvent: '32000000-0000-4000-8000-000000000039',
  configEvent: '32000000-0000-4000-8000-000000000040',
  resourceEvent: '32000000-0000-4000-8000-000000000041',
  privateEvent: '32000000-0000-4000-8000-000000000042',
  siblingEvent: '32000000-0000-4000-8000-000000000043',
  systemEvent: '32000000-0000-4000-8000-000000000044',
  unknownActorEvent: '32000000-0000-4000-8000-000000000045',
  precisionOldest: '32000000-0000-4000-8000-000000000046',
  precisionMiddle: '32000000-0000-4000-8000-000000000047',
  precisionNewest: '32000000-0000-4000-8000-000000000048',
});

export const listHistoryActivityConformanceScenarios: readonly ListHistoryActivityConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'defaults return only allowlisted location activity',
      kind: 'requests' as const,
      requests: Object.freeze([
        { locationId: listHistoryActivityLocationId, limit: 50 },
      ]),
    }),
    Object.freeze({
      name: 'all filters and their intersections select identically',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: listHistoryActivityLocationId,
          runId: listHistoryActivityIds.runA,
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          entityType: 'stage_run' as const,
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          eventType: 'stage_completed' as const,
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          orderResolution: 'archived' as const,
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          orderResolution: 'restored' as const,
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          search: 'STAGE_COMPLETED',
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          search: 'PRODUCTION_BATCH',
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          search: listHistoryActivityIds.shiftA,
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          search: 'ALEX OPERATOR',
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          occurredAfter: new Date('2026-08-22T18:30:00.000Z'),
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          runId: listHistoryActivityIds.runA,
          entityType: 'production_order' as const,
          eventType: 'production_order_resolved_without_production' as const,
          orderResolution: 'archived' as const,
          search: 'ALEX OPERATOR',
          occurredAfter: new Date('2026-08-22T18:30:00.000Z'),
          limit: 100,
        },
        {
          locationId: listHistoryActivityLocationId,
          orderResolution: 'archived' as const,
          eventType: 'production_order_restored' as const,
          limit: 100,
        },
      ]),
    }),
    Object.freeze({
      name: 'microsecond cursor pagination has no gaps or duplicates',
      kind: 'paginate' as const,
      input: Object.freeze({
        locationId: listHistoryActivityLocationId,
        eventType: 'stage_started' as const,
        limit: 1,
      }),
    }),
    Object.freeze({
      name: 'one-hundred and one rows produce an exact continuation page',
      kind: 'paginate' as const,
      input: Object.freeze({
        locationId: listHistoryActivityBoundaryLocationId,
        eventType: 'stage_started' as const,
        limit: 100,
      }),
    }),
    Object.freeze({
      name: 'invalid cursor precedence missing location and sibling scope match',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: 'missing-history-activity-location',
          cursor: 'not-a-valid-cursor',
          limit: 50,
        },
        {
          locationId: 'missing-history-activity-location',
          limit: 50,
        },
        {
          locationId: listHistoryActivitySiblingLocationId,
          limit: 50,
        },
      ]),
    }),
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

export const canonicalizeListHistoryActivityValue = (
  value: unknown,
): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value.map(canonicalizeListHistoryActivityValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [
        key,
        canonicalizeListHistoryActivityValue(entry),
      ]),
  );
};

const nullableString = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const canonicalFailure = (
  value: unknown,
): CanonicalListHistoryActivityFailure => {
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

export const captureListHistoryActivityOutcome = async (
  execute: (input: ListHistoryActivityInput) => Promise<unknown>,
  input: ListHistoryActivityInput,
): Promise<CanonicalListHistoryActivityOutcome> => {
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
    return Object.freeze({
      kind: 'success',
      value: canonicalizeListHistoryActivityValue(value),
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

export const listHistoryActivityNextCursor = (
  outcome: CanonicalListHistoryActivityOutcome,
): string | null => {
  if (outcome.kind !== 'success') return null;
  const cursor = record(outcome.value)?.['nextCursor'];
  return typeof cursor === 'string' ? cursor : null;
};

export const runListHistoryActivityConformanceScenario = async (
  execute: (input: ListHistoryActivityInput) => Promise<unknown>,
  scenario: ListHistoryActivityConformanceScenario,
): Promise<readonly CanonicalListHistoryActivityOutcome[]> => {
  if (scenario.kind === 'requests') {
    const outcomes: CanonicalListHistoryActivityOutcome[] = [];
    for (const request of scenario.requests)
      outcomes.push(await captureListHistoryActivityOutcome(execute, request));
    return Object.freeze(outcomes);
  }

  const outcomes: CanonicalListHistoryActivityOutcome[] = [];
  let cursor: string | undefined;
  do {
    const outcome = await captureListHistoryActivityOutcome(execute, {
      ...scenario.input,
      ...(cursor === undefined ? {} : { cursor }),
    });
    outcomes.push(outcome);
    cursor = listHistoryActivityNextCursor(outcome) ?? undefined;
  } while (cursor !== undefined);
  return Object.freeze(outcomes);
};
