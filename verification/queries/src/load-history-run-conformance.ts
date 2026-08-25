import type { LoadHistoryRunInput } from '@pressly/production-system/operations/history/load-run/types';

export type CanonicalLoadHistoryRunFailure = Readonly<{
  tag: string | null;
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalLoadHistoryRunOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalLoadHistoryRunFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalLoadHistoryRunFailure;
    }>;

// Permanent conformance for the current query.
// The characterized scenarios and explicit assertions remain the oracle.
export type LoadHistoryRunConformanceScenario = Readonly<{
  name: string;
  requests: readonly LoadHistoryRunInput[];
}>;

export const loadHistoryRunLocationId = 'location-history-run-conformance';
export const loadHistoryRunSiblingLocationId =
  'location-history-run-conformance-sibling';
export const loadHistoryRunBoundaryLocationId =
  'location-history-run-conformance-boundary';
export const loadHistoryRunAsOf = new Date('2026-08-22T21:00:00.000Z');

export const loadHistoryRunIds = Object.freeze({
  business: '33000000-0000-4000-8000-000000000001',
  actor: '33000000-0000-4000-8000-000000000002',
  unknownActor: '33000000-0000-4000-8000-000000000003',
  shiftA: '33000000-0000-4000-8000-000000000004',
  shiftB: '33000000-0000-4000-8000-000000000005',
  siblingShift: '33000000-0000-4000-8000-000000000006',
  boundaryShift: '33000000-0000-4000-8000-000000000007',
  configA: '33000000-0000-4000-8000-000000000008',
  configB: '33000000-0000-4000-8000-000000000009',
  siblingConfig: '33000000-0000-4000-8000-000000000010',
  boundaryConfig: '33000000-0000-4000-8000-000000000011',
  oldScheduleA: '33000000-0000-4000-8000-000000000012',
  scheduleA: '33000000-0000-4000-8000-000000000013',
  newScheduleA: '33000000-0000-4000-8000-000000000014',
  scheduleB: '33000000-0000-4000-8000-000000000015',
  siblingSchedule: '33000000-0000-4000-8000-000000000016',
  boundarySchedule: '33000000-0000-4000-8000-000000000017',
  runA: '33000000-0000-4000-8000-000000000018',
  runB: '33000000-0000-4000-8000-000000000019',
  siblingRun: '33000000-0000-4000-8000-000000000020',
  boundaryRun: '33000000-0000-4000-8000-000000000021',
  batchA0: '33000000-0000-4000-8000-000000000022',
  batchA1: '33000000-0000-4000-8000-000000000023',
  batchB: '33000000-0000-4000-8000-000000000024',
  sourceOrderA: '33000000-0000-4000-8000-000000000025',
  fulfillmentA: '33000000-0000-4000-8000-000000000026',
  demandA: '33000000-0000-4000-8000-000000000027',
  productionOrderA: '33000000-0000-4000-8000-000000000028',
  sourceOrderB: '33000000-0000-4000-8000-000000000029',
  fulfillmentB: '33000000-0000-4000-8000-000000000030',
  demandB: '33000000-0000-4000-8000-000000000031',
  productionOrderB: '33000000-0000-4000-8000-000000000032',
  membershipA0: '33000000-0000-4000-8000-000000000033',
  membershipA1: '33000000-0000-4000-8000-000000000034',
  membershipBCurrent: '33000000-0000-4000-8000-000000000035',
  membershipAInRunB: '33000000-0000-4000-8000-000000000036',
  sortingStation: '33000000-0000-4000-8000-000000000037',
  washingStation: '33000000-0000-4000-8000-000000000038',
  dryingStation: '33000000-0000-4000-8000-000000000039',
  foldingStation: '33000000-0000-4000-8000-000000000040',
  washer: '33000000-0000-4000-8000-000000000041',
  dryer: '33000000-0000-4000-8000-000000000042',
  runEvent: '33000000-0000-4000-8000-000000000043',
  batchEvent: '33000000-0000-4000-8000-000000000044',
  scheduleEvent: '33000000-0000-4000-8000-000000000045',
  shiftEvent: '33000000-0000-4000-8000-000000000046',
  demandEvent: '33000000-0000-4000-8000-000000000047',
  orderEvent: '33000000-0000-4000-8000-000000000048',
  stageEvent: '33000000-0000-4000-8000-000000000049',
  privateEvent: '33000000-0000-4000-8000-000000000050',
  siblingEvent: '33000000-0000-4000-8000-000000000051',
});

export const loadHistoryRunConformanceScenarios: readonly LoadHistoryRunConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'full run A graph and historical episodes match',
      requests: Object.freeze([
        {
          locationId: loadHistoryRunLocationId,
          productionRunId: loadHistoryRunIds.runA,
        },
      ]),
    }),
    Object.freeze({
      name: 'cross-run order and demand attribution follows requested run B',
      requests: Object.freeze([
        {
          locationId: loadHistoryRunLocationId,
          productionRunId: loadHistoryRunIds.runB,
        },
      ]),
    }),
    Object.freeze({
      name: 'empty sibling run remains location scoped',
      requests: Object.freeze([
        {
          locationId: loadHistoryRunSiblingLocationId,
          productionRunId: loadHistoryRunIds.siblingRun,
        },
      ]),
    }),
    Object.freeze({
      name: 'activity boundary reads 101 and returns 100 with hasMore',
      requests: Object.freeze([
        {
          locationId: loadHistoryRunBoundaryLocationId,
          productionRunId: loadHistoryRunIds.boundaryRun,
        },
      ]),
    }),
    Object.freeze({
      name: 'missing location run and cross-location concealment remain distinct',
      requests: Object.freeze([
        {
          locationId: 'missing-history-run-location',
          productionRunId: loadHistoryRunIds.runA,
        },
        {
          locationId: loadHistoryRunLocationId,
          productionRunId: '33000000-0000-4000-8000-000000000999',
        },
        {
          locationId: loadHistoryRunLocationId,
          productionRunId: loadHistoryRunIds.siblingRun,
        },
      ]),
    }),
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

export const canonicalizeLoadHistoryRunValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeLoadHistoryRunValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeLoadHistoryRunValue(entry)]),
  );
};

const nullableString = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const canonicalFailure = (value: unknown): CanonicalLoadHistoryRunFailure => {
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

export const captureLoadHistoryRunOutcome = async (
  execute: (input: LoadHistoryRunInput) => Promise<unknown>,
  input: LoadHistoryRunInput,
): Promise<CanonicalLoadHistoryRunOutcome> => {
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
      value: canonicalizeLoadHistoryRunValue(value),
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

export const runLoadHistoryRunConformanceScenario = async (
  execute: (input: LoadHistoryRunInput) => Promise<unknown>,
  scenario: LoadHistoryRunConformanceScenario,
): Promise<readonly CanonicalLoadHistoryRunOutcome[]> => {
  const outcomes: CanonicalLoadHistoryRunOutcome[] = [];
  for (const request of scenario.requests)
    outcomes.push(await captureLoadHistoryRunOutcome(execute, request));
  return Object.freeze(outcomes);
};
