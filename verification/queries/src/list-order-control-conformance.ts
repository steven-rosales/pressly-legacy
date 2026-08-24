import type { ListOrderControlInput } from '@pressly/production-system/operations/orders/list-order-control/types';

export type CanonicalListOrderControlFailure = Readonly<{
  tag: string | null;
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalListOrderControlOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalListOrderControlFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalListOrderControlFailure;
    }>;

export type ListOrderControlConformanceScenario =
  | Readonly<{
      name: string;
      kind: 'requests';
      requests: readonly ListOrderControlInput[];
    }>
  | Readonly<{
      name: string;
      kind: 'paginate';
      input: Omit<ListOrderControlInput, 'cursor'>;
    }>;

export const listOrderControlLocationId = 'location-order-control-conformance';
export const listOrderControlSiblingLocationId =
  'location-order-control-conformance-sibling';
export const listOrderControlInactiveLocationId =
  'location-order-control-conformance-inactive';
export const listOrderControlAsOf = new Date('2026-03-08T16:00:00.000Z');

export const listOrderControlIds = Object.freeze({
  business: '34000000-0000-4000-8000-000000000001',
  actor: '34000000-0000-4000-8000-000000000002',
  shift: '34000000-0000-4000-8000-000000000003',
  config: '34000000-0000-4000-8000-000000000004',
  schedule: '34000000-0000-4000-8000-000000000005',
  run: '34000000-0000-4000-8000-000000000006',
  sourceBatch: '34000000-0000-4000-8000-000000000007',
  targetBatch: '34000000-0000-4000-8000-000000000008',
  frozenBatch: '34000000-0000-4000-8000-000000000009',
  sortingStation: '34000000-0000-4000-8000-000000000010',
  washingStation: '34000000-0000-4000-8000-000000000011',
  dryingStation: '34000000-0000-4000-8000-000000000012',
  foldingStation: '34000000-0000-4000-8000-000000000013',
  washer: '34000000-0000-4000-8000-000000000014',
  dryer: '34000000-0000-4000-8000-000000000015',
  routeEvent: '34000000-0000-4000-8000-000000000016',
  siblingShift: '34000000-0000-4000-8000-000000000017',
  siblingConfig: '34000000-0000-4000-8000-000000000018',
  siblingSchedule: '34000000-0000-4000-8000-000000000019',
  siblingRun: '34000000-0000-4000-8000-000000000020',
  intake: '34000000-0000-4000-8000-000000000021',
  conflict: '34000000-0000-4000-8000-000000000022',
  eligible: '34000000-0000-4000-8000-000000000023',
  release: '34000000-0000-4000-8000-000000000024',
  override: '34000000-0000-4000-8000-000000000025',
  tomorrow: '34000000-0000-4000-8000-000000000026',
  hiddenIntake: '34000000-0000-4000-8000-000000000027',
  finished: '34000000-0000-4000-8000-000000000028',
  resolved: '34000000-0000-4000-8000-000000000029',
  activeA: '34000000-0000-4000-8000-000000000040',
  activeB: '34000000-0000-4000-8000-000000000041',
  sibling: '34000000-0000-4000-8000-000000000050',
});

const input = (
  patch: Partial<ListOrderControlInput> = {},
): ListOrderControlInput => ({
  locationId: listOrderControlLocationId,
  view: 'attention',
  limit: 25,
  ...patch,
});

export const listOrderControlConformanceScenarios: readonly ListOrderControlConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'defaults active-location concealment and exclusions match',
      kind: 'requests' as const,
      requests: Object.freeze([
        input(),
        input({ locationId: 'missing-order-control-location' }),
        input({ locationId: listOrderControlInactiveLocationId }),
        input({
          locationId: listOrderControlSiblingLocationId,
          view: 'all',
        }),
      ]),
    }),
    Object.freeze({
      name: 'every view and individual filter intersection matches',
      kind: 'requests' as const,
      requests: Object.freeze([
        input({ view: 'attention', status: 'scheduled' }),
        input({ view: 'active', priority: true }),
        input({ view: 'active', priority: false }),
        input({ view: 'active', movable: true }),
        input({ view: 'active', movable: false }),
        input({ view: 'active', stage: 'washing' }),
        input({ view: 'all', dueBucket: 'overdue' }),
        input({ view: 'all', dueBucket: 'today' }),
        input({ view: 'all', dueBucket: 'tomorrow' }),
        input({ view: 'all', dueBucket: 'later' }),
        input({ view: 'intake', movable: false }),
        input({ view: 'all', search: 'eligible-clear' }),
        input({ view: 'active', productionRunId: listOrderControlIds.run }),
        input({
          view: 'active',
          productionBatchId: listOrderControlIds.sourceBatch,
        }),
        input({ view: 'all', status: 'eligible' }),
      ]),
    }),
    Object.freeze({
      name: 'all filters combine with exact precedence and capabilities',
      kind: 'requests' as const,
      requests: Object.freeze([
        input({
          view: 'active',
          search: 'ACTIVE-A',
          status: 'scheduled',
          dueBucket: 'today',
          productionRunId: listOrderControlIds.run,
          productionBatchId: listOrderControlIds.sourceBatch,
          stage: 'sorting',
          priority: true,
          movable: true,
        }),
      ]),
    }),
    Object.freeze({
      name: 'due-at plus UUID cursor pagination has no gap',
      kind: 'paginate' as const,
      input: Object.freeze(input({ view: 'active', limit: 1 })) as Omit<
        ListOrderControlInput,
        'cursor'
      >,
    }),
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

export const canonicalizeListOrderControlValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeListOrderControlValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeListOrderControlValue(entry)]),
  );
};

const nullableString = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const canonicalFailure = (value: unknown): CanonicalListOrderControlFailure => {
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

export const captureListOrderControlOutcome = async (
  execute: (input: ListOrderControlInput) => Promise<unknown>,
  request: ListOrderControlInput,
): Promise<CanonicalListOrderControlOutcome> => {
  try {
    const raw = await execute(request);
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
      value: canonicalizeListOrderControlValue(value),
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

export const listOrderControlNextCursor = (
  outcome: CanonicalListOrderControlOutcome,
): string | null => {
  if (outcome.kind !== 'success') return null;
  const cursor = record(outcome.value)?.['nextCursor'];
  return typeof cursor === 'string' ? cursor : null;
};

export const runListOrderControlConformanceScenario = async (
  execute: (input: ListOrderControlInput) => Promise<unknown>,
  scenario: ListOrderControlConformanceScenario,
): Promise<readonly CanonicalListOrderControlOutcome[]> => {
  if (scenario.kind === 'requests') {
    const outcomes: CanonicalListOrderControlOutcome[] = [];
    for (const request of scenario.requests)
      outcomes.push(await captureListOrderControlOutcome(execute, request));
    return Object.freeze(outcomes);
  }
  const outcomes: CanonicalListOrderControlOutcome[] = [];
  let cursor: string | undefined;
  do {
    const outcome = await captureListOrderControlOutcome(execute, {
      ...scenario.input,
      ...(cursor === undefined ? {} : { cursor }),
    });
    outcomes.push(outcome);
    cursor = listOrderControlNextCursor(outcome) ?? undefined;
  } while (cursor !== undefined);
  return Object.freeze(outcomes);
};
