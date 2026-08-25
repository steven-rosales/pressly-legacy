import type { ListHistoryRunsInput } from '@pressly/production-system/operations/history/list-runs/types';
import type { ListLocationsInput } from '@pressly/production-system/operations/resources/list-locations/types';
import type { ListOrdersInput } from '@pressly/production-system/operations/orders/list-orders/types';

export type CanonicalQueryFailure = Readonly<{
  tag: string | null;
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalQueryOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'failure'; failure: CanonicalQueryFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalQueryFailure }>;

export type QueryConformanceScenario<Input extends object> =
  | Readonly<{
      name: string;
      kind: 'requests';
      requests: readonly Input[];
    }>
  | Readonly<{
      name: string;
      kind: 'paginate';
      input: Input;
    }>
  | Readonly<{
      name: string;
      kind: 'cursor-scope-mismatch';
      first: Input;
      mismatched: Input;
    }>;

export type QueryConformanceObservation<State> = Readonly<{
  outcome: readonly CanonicalQueryOutcome[];
  state: Readonly<{ before: State; after: State }>;
}>;

export const productionQueryConformanceLocations = Object.freeze({
  alpha: 'query-conformance-alpha',
  main: 'query-conformance-main',
  inactive: 'query-conformance-inactive',
  sibling: 'query-conformance-sibling',
  missing: 'query-conformance-missing',
});

const uuid = (suffix: number): string =>
  `50000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const productionQueryConformanceIds = Object.freeze({
  business: uuid(1),
  actor: uuid(2),
  sourceOrders: Object.freeze([
    uuid(11),
    uuid(12),
    uuid(13),
    uuid(14),
    uuid(15),
    uuid(16),
  ] as const),
  fulfillments: Object.freeze([
    uuid(21),
    uuid(22),
    uuid(23),
    uuid(24),
    uuid(25),
    uuid(26),
  ] as const),
  demands: Object.freeze([
    uuid(31),
    uuid(32),
    uuid(33),
    uuid(34),
    uuid(35),
    uuid(36),
  ] as const),
  productionOrders: Object.freeze([
    uuid(101),
    uuid(102),
    uuid(103),
    uuid(104),
    uuid(105),
    uuid(106),
  ] as const),
  shifts: Object.freeze([uuid(201), uuid(202), uuid(203)] as const),
  schedulerConfig: uuid(211),
  scheduleRuns: Object.freeze([uuid(221), uuid(222), uuid(223)] as const),
  productionRuns: Object.freeze([uuid(301), uuid(302), uuid(303)] as const),
  batches: Object.freeze([uuid(401), uuid(402), uuid(403)] as const),
  memberships: Object.freeze([uuid(501), uuid(502), uuid(503)] as const),
});

export const productionQueryConformanceAsOf = new Date(
  '2026-08-21T16:00:00.000Z',
);

export const listLocationsConformanceScenarios: readonly QueryConformanceScenario<ListLocationsInput>[] =
  Object.freeze([
    Object.freeze({
      name: 'null authorization scope keeps active locations in name/id order',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          includeInactive: false,
          allowedLocationIds: null,
        },
      ]),
    }),
    Object.freeze({
      name: 'include-inactive and a null scope expose every ordered location',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          includeInactive: true,
          allowedLocationIds: null,
        },
      ]),
    }),
    Object.freeze({
      name: 'authorization-derived subsets retain activity and ordering rules',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          includeInactive: false,
          allowedLocationIds: Object.freeze([
            productionQueryConformanceLocations.inactive,
            productionQueryConformanceLocations.main,
          ]),
        },
        {
          includeInactive: true,
          allowedLocationIds: Object.freeze([
            productionQueryConformanceLocations.inactive,
            productionQueryConformanceLocations.main,
          ]),
        },
      ]),
    }),
    Object.freeze({
      name: 'an empty authorization scope returns no locations',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          includeInactive: true,
          allowedLocationIds: Object.freeze([]),
        },
      ]),
    }),
  ]);

export const listOrdersConformanceScenarios: readonly QueryConformanceScenario<ListOrdersInput>[] =
  Object.freeze([
    Object.freeze({
      name: 'defaults preserve UUID order due buckets and display references',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: productionQueryConformanceLocations.main,
          limit: 50,
        },
      ]),
    }),
    Object.freeze({
      name: 'status and strict due bounds normalize to the same filters',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: productionQueryConformanceLocations.main,
          status: 'scheduled' as const,
          limit: 50,
        },
        {
          locationId: productionQueryConformanceLocations.main,
          dueAfter: new Date('2026-08-21T03:59:59.000Z'),
          dueBefore: new Date('2026-08-22T04:00:00.000Z'),
          limit: 50,
        },
      ]),
    }),
    Object.freeze({
      name: 'cursor bytes paginate ascending UUID order without gaps',
      kind: 'paginate' as const,
      input: Object.freeze({
        locationId: productionQueryConformanceLocations.main,
        limit: 2,
      }),
    }),
    Object.freeze({
      name: 'bad cursor precedence and missing or inactive locations match',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: productionQueryConformanceLocations.missing,
          cursor: 'not-a-valid-order-cursor',
          limit: 50,
        },
        {
          locationId: productionQueryConformanceLocations.missing,
          limit: 50,
        },
        {
          locationId: productionQueryConformanceLocations.inactive,
          limit: 50,
        },
      ]),
    }),
  ]);

export const listHistoryRunsConformanceScenarios: readonly QueryConformanceScenario<ListHistoryRunsInput>[] =
  Object.freeze([
    Object.freeze({
      name: 'defaults preserve descending microsecond order and page aggregates',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: productionQueryConformanceLocations.main,
          limit: 50,
        },
      ]),
    }),
    Object.freeze({
      name: 'search status and inclusive created-after filters match',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: productionQueryConformanceLocations.main,
          search: productionQueryConformanceIds.scheduleRuns[1].toUpperCase(),
          limit: 50,
        },
        {
          locationId: productionQueryConformanceLocations.main,
          status: 'completed' as const,
          limit: 50,
        },
        {
          locationId: productionQueryConformanceLocations.main,
          createdAfter: new Date('2026-08-21T15:45:00.000Z'),
          limit: 50,
        },
      ]),
    }),
    Object.freeze({
      name: 'cursor bytes paginate exact microsecond order without gaps',
      kind: 'paginate' as const,
      input: Object.freeze({
        locationId: productionQueryConformanceLocations.main,
        limit: 1,
      }),
    }),
    Object.freeze({
      name: 'history cursor remains bound to its complete filter scope',
      kind: 'cursor-scope-mismatch' as const,
      first: Object.freeze({
        locationId: productionQueryConformanceLocations.main,
        limit: 1,
      }),
      mismatched: Object.freeze({
        locationId: productionQueryConformanceLocations.main,
        status: 'completed' as const,
        limit: 1,
      }),
    }),
    Object.freeze({
      name: 'bad cursor precedence and location existence behavior match',
      kind: 'requests' as const,
      requests: Object.freeze([
        {
          locationId: productionQueryConformanceLocations.missing,
          cursor: 'not-a-valid-history-cursor',
          limit: 50,
        },
        {
          locationId: productionQueryConformanceLocations.missing,
          limit: 50,
        },
        {
          locationId: productionQueryConformanceLocations.inactive,
          limit: 50,
        },
      ]),
    }),
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

export const canonicalizeQueryValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalizeQueryValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeQueryValue(entry)]),
  );
};

const nullableString = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const canonicalFailure = (value: unknown): CanonicalQueryFailure => {
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

export const captureQueryOutcome = async <Input extends object>(
  execute: (input: Input) => Promise<unknown>,
  input: Input,
): Promise<CanonicalQueryOutcome> => {
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
      value: canonicalizeQueryValue(value),
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

const nextCursor = (outcome: CanonicalQueryOutcome): string | null => {
  if (outcome.kind !== 'success') return null;
  const value = record(outcome.value);
  const cursor = value?.['nextCursor'];
  return typeof cursor === 'string' ? cursor : null;
};

const missingCursorOutcome = (): CanonicalQueryOutcome =>
  Object.freeze({
    kind: 'unexpected' as const,
    error: canonicalFailure({
      kind: 'invalid_fixture',
      code: 'missing_query_cursor',
      message: 'The query page did not return the expected cursor.',
    }),
  });

export const runQueryConformanceScenario = async <Input extends object>(
  execute: (input: Input) => Promise<unknown>,
  scenario: QueryConformanceScenario<Input>,
): Promise<readonly CanonicalQueryOutcome[]> => {
  if (scenario.kind === 'requests') {
    const outcomes: CanonicalQueryOutcome[] = [];
    for (const request of scenario.requests)
      outcomes.push(await captureQueryOutcome(execute, request));
    return Object.freeze(outcomes);
  }

  if (scenario.kind === 'cursor-scope-mismatch') {
    const first = await captureQueryOutcome(execute, scenario.first);
    const cursor = nextCursor(first);
    if (cursor === null) return Object.freeze([first, missingCursorOutcome()]);
    return Object.freeze([
      first,
      await captureQueryOutcome(execute, {
        ...scenario.mismatched,
        cursor,
      } as Input),
    ]);
  }

  const outcomes: CanonicalQueryOutcome[] = [];
  let cursor: string | undefined;
  do {
    const outcome = await captureQueryOutcome(execute, {
      ...scenario.input,
      ...(cursor === undefined ? {} : { cursor }),
    } as Input);
    outcomes.push(outcome);
    cursor = nextCursor(outcome) ?? undefined;
  } while (cursor !== undefined);
  return Object.freeze(outcomes);
};
