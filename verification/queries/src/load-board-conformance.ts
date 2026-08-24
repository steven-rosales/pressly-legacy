import type { LoadBoardInput } from '@pressly/production-system/operations/queries/load-board/types';

export type CanonicalLoadBoardFailure = Readonly<{
  tag: string | null;
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalLoadBoardOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'failure'; failure: CanonicalLoadBoardFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalLoadBoardFailure }>;

// Permanent conformance for the current query.
// The characterized scenarios and explicit assertions remain the oracle.
export type LoadBoardConformanceScenario = Readonly<{
  name: string;
  requests: readonly LoadBoardInput[];
}>;

export const loadBoardLocationId = 'location-load-board-conformance';
export const loadBoardSiblingLocationId =
  'location-load-board-conformance-sibling';
export const loadBoardAsOf = new Date('2026-03-08T06:30:00.000Z');

export const loadBoardIds = Object.freeze({
  business: '35000000-0000-4000-8000-000000000001',
  actor: '35000000-0000-4000-8000-000000000002',
  targetShift: '35000000-0000-4000-8000-000000000003',
  otherShift: '35000000-0000-4000-8000-000000000004',
  siblingShift: '35000000-0000-4000-8000-000000000005',
  config: '35000000-0000-4000-8000-000000000006',
  siblingConfig: '35000000-0000-4000-8000-000000000007',
  targetSchedule: '35000000-0000-4000-8000-000000000008',
  otherSchedule: '35000000-0000-4000-8000-000000000009',
  siblingSchedule: '35000000-0000-4000-8000-000000000010',
  targetRun: '35000000-0000-4000-8000-000000000011',
  otherRun: '35000000-0000-4000-8000-000000000012',
  siblingRun: '35000000-0000-4000-8000-000000000013',
  sortingStation: '35000000-0000-4000-8000-000000000014',
  washingStation: '35000000-0000-4000-8000-000000000015',
  dryingStation: '35000000-0000-4000-8000-000000000016',
  foldingStation: '35000000-0000-4000-8000-000000000017',
  safeWasher: '35000000-0000-4000-8000-000000000018',
  conflictWasher: '35000000-0000-4000-8000-000000000019',
  safeDryer: '35000000-0000-4000-8000-000000000020',
  activeDryer: '35000000-0000-4000-8000-000000000021',
  unrelatedMachine: '35000000-0000-4000-8000-000000000022',
  readyBatch: '35000000-0000-4000-8000-000000000023',
  overlapBatch: '35000000-0000-4000-8000-000000000024',
  sameKindBatch: '35000000-0000-4000-8000-000000000025',
  activeBatch: '35000000-0000-4000-8000-000000000026',
  finishedBatch: '35000000-0000-4000-8000-000000000027',
  otherSortingBatch: '35000000-0000-4000-8000-000000000028',
  otherDryingBatch: '35000000-0000-4000-8000-000000000029',
  otherPlannedBatch: '35000000-0000-4000-8000-000000000030',
  scheduledToday: '35000000-0000-4000-8000-000000000031',
  scheduledTomorrow: '35000000-0000-4000-8000-000000000032',
  scheduledOverlap: '35000000-0000-4000-8000-000000000033',
  scheduledSameKind: '35000000-0000-4000-8000-000000000034',
  scheduledActive: '35000000-0000-4000-8000-000000000035',
  eligibleDefault: '35000000-0000-4000-8000-000000000036',
  eligibleStored: '35000000-0000-4000-8000-000000000037',
  finished: '35000000-0000-4000-8000-000000000038',
  inactiveQueued: '35000000-0000-4000-8000-000000000039',
  resolved: '35000000-0000-4000-8000-000000000040',
});

export const loadBoardConformanceScenarios: readonly LoadBoardConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'complete adversarial operational board matches',
      requests: Object.freeze([
        {
          locationId: loadBoardLocationId,
          productionRunId: loadBoardIds.targetRun,
        },
      ]),
    }),
    Object.freeze({
      name: 'valid empty sibling board matches',
      requests: Object.freeze([
        {
          locationId: loadBoardSiblingLocationId,
          productionRunId: loadBoardIds.siblingRun,
        },
      ]),
    }),
    Object.freeze({
      name: 'missing and cross-location run identities remain concealed',
      requests: Object.freeze([
        {
          locationId: 'missing-load-board-location',
          productionRunId: loadBoardIds.targetRun,
        },
        {
          locationId: loadBoardLocationId,
          productionRunId: '35000000-0000-4000-8000-000000000999',
        },
        {
          locationId: loadBoardLocationId,
          productionRunId: loadBoardIds.siblingRun,
        },
        {
          locationId: loadBoardSiblingLocationId,
          productionRunId: loadBoardIds.targetRun,
        },
      ]),
    }),
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

export const canonicalizeLoadBoardValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeLoadBoardValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeLoadBoardValue(entry)]),
  );
};

const nullableString = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const canonicalFailure = (value: unknown): CanonicalLoadBoardFailure => {
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

export const captureLoadBoardOutcome = async (
  execute: (input: LoadBoardInput) => Promise<unknown>,
  input: LoadBoardInput,
): Promise<CanonicalLoadBoardOutcome> => {
  try {
    const raw = await execute(input);
    const outcome = record(raw);
    if (outcome?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(outcome['error']),
      });
    if (outcome?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(outcome['failure']),
      });
    const value =
      outcome?.['tag'] === 'ok' || outcome?.['kind'] === 'success'
        ? outcome['value']
        : raw;
    return Object.freeze({
      kind: 'success',
      value: canonicalizeLoadBoardValue(value),
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

export const runLoadBoardConformanceScenario = async (
  execute: (input: LoadBoardInput) => Promise<unknown>,
  scenario: LoadBoardConformanceScenario,
): Promise<readonly CanonicalLoadBoardOutcome[]> => {
  const outcomes: CanonicalLoadBoardOutcome[] = [];
  for (const request of scenario.requests)
    outcomes.push(await captureLoadBoardOutcome(execute, request));
  return Object.freeze(outcomes);
};
