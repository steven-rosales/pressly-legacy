import type { ExecutePreviewOrderBacklog } from '@pressly/production-system/operations/demand/preview-order-backlog/execute';
import { canonicalizeQueryValue } from './production-query-conformance.ts';

export type PreviewOrderBacklogInput =
  Parameters<ExecutePreviewOrderBacklog>[0];

type PreviewOrderBacklogCursor = NonNullable<
  PreviewOrderBacklogInput['cursor']
>;

const uuid = (suffix: number, prefix = 74000000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const previewOrderBacklogFixtureIds = Object.freeze({
  business: '00000000-0000-4000-8000-000000000740',
  actor: uuid(1),
  shift: uuid(2),
  config: uuid(3),
  schedule: uuid(4),
  run: uuid(5),
  batch: uuid(6),
  membership: uuid(7),
  station: uuid(8),
  stage: uuid(9),
  attempt: uuid(10),
  routeEvent: uuid(11),
  selectionEvent: uuid(12),
  readyA: uuid(101),
  readyB: uuid(102),
  review: uuid(103),
  participant: uuid(104),
  selectedSnapshot: uuid(105),
  selectedEvent: uuid(106),
  resolved: uuid(107),
  finished: uuid(108),
  afterCutoff: uuid(109),
  sibling: uuid(110),
  atCutoff: uuid(111),
});

export const previewOrderBacklogLocationId = 'location-preview-backlog';
export const previewOrderBacklogSiblingLocationId =
  'location-preview-backlog-sibling';
export const previewOrderBacklogMissingLocationId =
  'location-preview-backlog-missing';
export const previewOrderBacklogCutoff = '2026-08-01T00:00:00.000Z';
export const previewOrderBacklogGeneratedAt = new Date(
  '2026-08-22T15:00:00.000Z',
);

export const previewOrderBacklogExpectedCompleteHash =
  '9566a735b9fab2987196330adc89983aa35a3897da533ad6b8f6ad551021f16a';

export const previewOrderBacklogExpectedFirstCursor =
  'eyJ2ZXJzaW9uIjoxLCJsb2NhdGlvbklkIjoibG9jYXRpb24tcHJldmlldy1iYWNrbG9nIiwiZmlsdGVyIjoiYWxsX2R1ZV9iZWZvcmVfY3V0b2ZmIiwiY3V0b2ZmIjoiMjAyNi0wOC0wMVQwMDowMDowMC4wMDBaIiwicmVhc29uIjoicHJvY2Vzc29yX25vdF9pbl91c2UiLCJkdWVBdCI6IjIwMjYtMDctMDFUMTI6MDA6MDAuMDAwWiIsIm9yZGVySWQiOiI3NDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAxMDIifQ.e7a5ea4667269086cb4a7ff455be8f4bb2c19e821232d7449c4c2eb954d04f31' as PreviewOrderBacklogCursor;

const asCursor = (value: string): PreviewOrderBacklogCursor =>
  value as PreviewOrderBacklogCursor;

const request = (
  overrides: Partial<PreviewOrderBacklogInput> = {},
): PreviewOrderBacklogInput => ({
  locationId: previewOrderBacklogLocationId,
  filter: 'all_due_before_cutoff',
  cutoff: previewOrderBacklogCutoff,
  reason: 'processor_not_in_use',
  cursor: null,
  maxOrders: 250,
  ...overrides,
});

export type PreviewOrderBacklogFixture =
  | 'complete-safety-graph'
  | 'pagination'
  | 'location-roots';

export type PreviewOrderBacklogConformanceScenario =
  | Readonly<{
      name: string;
      fixture: PreviewOrderBacklogFixture;
      kind: 'requests';
      requests: readonly PreviewOrderBacklogInput[];
    }>
  | Readonly<{
      name: string;
      fixture: 'pagination';
      kind: 'cursor-behavior';
      first: PreviewOrderBacklogInput;
    }>;

export const previewOrderBacklogConformanceScenarios: readonly PreviewOrderBacklogConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'complete schema-valid safety graph preserves four classifications and v2 hash',
      fixture: 'complete-safety-graph' as const,
      kind: 'requests' as const,
      requests: Object.freeze([request()]),
    }),
    Object.freeze({
      name: 'inclusive cutoff and minimum/maximum page bounds remain exact',
      fixture: 'complete-safety-graph' as const,
      kind: 'requests' as const,
      requests: Object.freeze([
        request({ maxOrders: 1 }),
        request({ maxOrders: 250 }),
      ]),
    }),
    Object.freeze({
      name: 'missing locations preserve the deployed empty-success quirk',
      fixture: 'location-roots' as const,
      kind: 'requests' as const,
      requests: Object.freeze([
        request({ locationId: previewOrderBacklogMissingLocationId }),
      ]),
    }),
    Object.freeze({
      name: 'malformed cursor failure precedes missing-location lookup and clock',
      fixture: 'location-roots' as const,
      kind: 'requests' as const,
      requests: Object.freeze([
        request({
          locationId: previewOrderBacklogMissingLocationId,
          cursor: asCursor('not-a-valid-backlog-cursor'),
        }),
      ]),
    }),
    Object.freeze({
      name: 'v1 cursor bytes paginate and bind scope while remaining limit independent',
      fixture: 'pagination' as const,
      kind: 'cursor-behavior' as const,
      first: request({ maxOrders: 2 }),
    }),
  ]);

export type PreviewOrderBacklogTraceEvent = 'read' | 'clock';

export type CanonicalPreviewOrderBacklogFailure = Readonly<{
  tag: string | null;
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
  reason: string | null;
}>;

export type CanonicalPreviewOrderBacklogOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalPreviewOrderBacklogFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalPreviewOrderBacklogFailure;
    }>;

export type PreviewOrderBacklogTarget = Readonly<{
  execute: (input: PreviewOrderBacklogInput) => Promise<unknown>;
  trace: () => readonly PreviewOrderBacklogTraceEvent[];
}>;

export type PreviewOrderBacklogConformanceObservation<State> = Readonly<{
  outcome: readonly CanonicalPreviewOrderBacklogOutcome[];
  state: Readonly<{
    before: State;
    after: State;
  }>;
  timing: readonly PreviewOrderBacklogTraceEvent[];
}>;

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const stringField = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const canonicalFailure = (
  value: unknown,
): CanonicalPreviewOrderBacklogFailure => {
  const fields = record(value);
  const details = record(fields?.['details']);
  return Object.freeze({
    tag: stringField(fields, 'tag'),
    kind: stringField(fields, 'kind') ?? 'unknown',
    classification: stringField(fields, 'classification'),
    code: stringField(fields, 'code') ?? 'unknown_error',
    message:
      value instanceof Error
        ? value.message
        : (stringField(fields, 'message') ?? 'Unknown error.'),
    safeMessage: stringField(fields, 'safeMessage'),
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
    reason: stringField(details, 'reason'),
  });
};

export const capturePreviewOrderBacklogOutcome = async (
  execute: (input: PreviewOrderBacklogInput) => Promise<unknown>,
  input: PreviewOrderBacklogInput,
): Promise<CanonicalPreviewOrderBacklogOutcome> => {
  try {
    const raw = await execute(input);
    const carrier = record(raw);
    if (carrier?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['error']),
      });
    if (carrier?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['failure']),
      });
    const value =
      carrier?.['tag'] === 'ok' || carrier?.['kind'] === 'success'
        ? carrier['value']
        : raw;
    return Object.freeze({
      kind: 'success',
      value: canonicalizeQueryValue(value),
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

const nextCursor = (
  outcome: CanonicalPreviewOrderBacklogOutcome,
): PreviewOrderBacklogCursor | null => {
  if (outcome.kind !== 'success') return null;
  const cursor = record(outcome.value)?.['nextCursor'];
  return typeof cursor === 'string' ? asCursor(cursor) : null;
};

const missingCursorOutcome = (): CanonicalPreviewOrderBacklogOutcome =>
  Object.freeze({
    kind: 'unexpected' as const,
    error: Object.freeze({
      tag: null,
      kind: 'invalid_fixture',
      classification: null,
      code: 'missing_preview_order_backlog_cursor',
      message: 'The first page did not return the expected cursor.',
      safeMessage: null,
      status: null,
      reason: null,
    }),
  });

const tamper = (cursor: PreviewOrderBacklogCursor): PreviewOrderBacklogCursor =>
  asCursor(`${cursor.slice(0, -1)}${cursor.endsWith('a') ? 'b' : 'a'}`);

const runScenario = async (
  scenario: PreviewOrderBacklogConformanceScenario,
  target: PreviewOrderBacklogTarget,
): Promise<readonly CanonicalPreviewOrderBacklogOutcome[]> => {
  if (scenario.kind === 'requests') {
    const outcomes: CanonicalPreviewOrderBacklogOutcome[] = [];
    for (const input of scenario.requests)
      outcomes.push(
        await capturePreviewOrderBacklogOutcome(target.execute, input),
      );
    return Object.freeze(outcomes);
  }

  const first = await capturePreviewOrderBacklogOutcome(
    target.execute,
    scenario.first,
  );
  const cursor = nextCursor(first);
  if (cursor === null) return Object.freeze([first, missingCursorOutcome()]);
  return Object.freeze([
    first,
    await capturePreviewOrderBacklogOutcome(target.execute, {
      ...scenario.first,
      cursor,
      maxOrders: 250,
    }),
    await capturePreviewOrderBacklogOutcome(target.execute, {
      ...scenario.first,
      cursor,
      cutoff: '2026-08-02T00:00:00.000Z',
    }),
    await capturePreviewOrderBacklogOutcome(target.execute, {
      ...scenario.first,
      cursor,
      reason: 'duplicate_or_test',
    }),
    await capturePreviewOrderBacklogOutcome(target.execute, {
      ...scenario.first,
      locationId: previewOrderBacklogMissingLocationId,
      cursor,
    }),
    await capturePreviewOrderBacklogOutcome(target.execute, {
      ...scenario.first,
      cursor: tamper(cursor),
    }),
  ]);
};

export const runPreviewOrderBacklogConformanceScenario = async <State>(input: {
  scenario: PreviewOrderBacklogConformanceScenario;
  reset: () => Promise<void>;
  seed: (fixture: PreviewOrderBacklogFixture) => Promise<void>;
  readState: () => Promise<State>;
  makeTarget: () => PreviewOrderBacklogTarget;
}): Promise<PreviewOrderBacklogConformanceObservation<State>> => {
  await input.reset();
  await input.seed(input.scenario.fixture);
  const before = await input.readState();

  const target = input.makeTarget();
  const outcome = await runScenario(input.scenario, target);
  const after = await input.readState();

  return Object.freeze({
    outcome,
    state: Object.freeze({ before, after }),
    timing: Object.freeze([...target.trace()]),
  });
};
