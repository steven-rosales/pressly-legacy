import type {
  ReplaceShiftSelectionCommand,
  ReplaceShiftSelectionResult,
} from '@pressly/production-system/operations/scheduling/replace-shift-selection/types';

export type ReplaceShiftSelectionTransactionOutcome =
  | 'committed'
  | 'expected_rollback'
  | 'failed';

export type ReplaceShiftSelectionFixture = Readonly<{
  shift?: 'missing' | 'open' | 'started';
  selection?: 'empty_v1' | 'first_v1' | null;
  currentSchedule?: 'accepted' | 'draft' | 'rejected' | null;
  readiness?: 'missing' | 'not_ready' | 'ready' | 'resolved';
  storedReceipt?: 'divergent' | 'malformed' | 'matching';
  fault?:
    | 'event_id_collision'
    | 'schedule_cas'
    | 'selection_insert_cas'
    | 'selection_update_cas'
    | 'slow_event_append';
  signalFault?: boolean;
}>;

export type ReplaceShiftSelectionExecutionMode = 'concurrent' | 'sequential';

export type ReplaceShiftSelectionScenario = Readonly<{
  name: string;
  fixture: ReplaceShiftSelectionFixture;
  commands: readonly ReplaceShiftSelectionCommand[];
  executionMode: ReplaceShiftSelectionExecutionMode;
  expectedOutcomeCodes: readonly string[];
}>;

export type CanonicalReplaceShiftSelectionFailure = Readonly<{
  kind: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalReplaceShiftSelectionOutcome =
  | Readonly<{ kind: 'success'; value: ReplaceShiftSelectionResult }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalReplaceShiftSelectionFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalReplaceShiftSelectionFailure;
    }>;

const uuid = (suffix: number): string =>
  `83000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const replaceShiftSelectionConformanceIds = Object.freeze({
  business: uuid(1),
  actor: uuid(2),
  shift: uuid(3),
  fulfillment1: uuid(7),
  fulfillment2: uuid(8),
  fulfillment3: uuid(9),
  demand1: uuid(10),
  demand2: uuid(11),
  demand3: uuid(12),
  productionOrder1: uuid(13),
  productionOrder2: uuid(14),
  productionOrder3: uuid(15),
  missingProductionOrder: uuid(16),
  config: uuid(17),
  schedule: uuid(18),
  run: uuid(19),
  eventA: uuid(20),
  eventB: uuid(21),
  fixtureEvent: uuid(22),
});

export const replaceShiftSelectionConformanceLocationId =
  'location-replace-shift-selection-conformance';
export const replaceShiftSelectionConformanceNow = new Date(
  '2026-08-22T14:00:00.000Z',
);

export const makeReplaceShiftSelectionConformanceCommand = (
  overrides: Partial<ReplaceShiftSelectionCommand> = {},
): ReplaceShiftSelectionCommand => ({
  locationId: replaceShiftSelectionConformanceLocationId,
  productionShiftId: replaceShiftSelectionConformanceIds.shift,
  actorId: replaceShiftSelectionConformanceIds.actor,
  selectedOrderIds: [
    replaceShiftSelectionConformanceIds.productionOrder2,
    replaceShiftSelectionConformanceIds.productionOrder1,
  ],
  expectedVersion: 0,
  idempotencyKey: 'replace-shift-selection-conformance-1',
  ...overrides,
});

const command = makeReplaceShiftSelectionConformanceCommand;
const failure = (code: string): string => `failure:${code}`;

export const replaceShiftSelectionConformanceScenarios: readonly ReplaceShiftSelectionScenario[] =
  Object.freeze([
    {
      name: 'version zero creates version one with sorted selected IDs and one audited receipt',
      fixture: {},
      commands: [command()],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:1:false'],
    },
    {
      name: 'empty version-zero no-op preserves absent selection but still audits the command',
      fixture: {},
      commands: [
        command({
          selectedOrderIds: [],
          idempotencyKey: 'replace-selection-empty-no-op',
        }),
      ],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:0:false'],
    },
    {
      name: 'identical canonical selection preserves version current plan clock and signal but audits',
      fixture: { selection: 'first_v1', currentSchedule: 'draft' },
      commands: [
        command({
          selectedOrderIds: [
            replaceShiftSelectionConformanceIds.productionOrder1,
          ],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-identical-no-op',
        }),
      ],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:1:false'],
    },
    ...(['draft', 'accepted'] as const).map((currentSchedule) => ({
      name: `changed selection supersedes the current ${currentSchedule} plan atomically then signals once`,
      fixture: { selection: 'first_v1' as const, currentSchedule },
      commands: [
        command({
          selectedOrderIds: [
            replaceShiftSelectionConformanceIds.productionOrder3,
            replaceShiftSelectionConformanceIds.productionOrder2,
          ],
          expectedVersion: 1,
          idempotencyKey: `replace-selection-supersede-${currentSchedule}`,
        }),
      ],
      executionMode: 'sequential' as const,
      expectedOutcomeCodes: ['success:2:false'] as const,
    })),
    {
      name: 'non-current rejected plan is ignored by executable current-plan lookup',
      fixture: { selection: 'first_v1', currentSchedule: 'rejected' },
      commands: [
        command({
          selectedOrderIds: [
            replaceShiftSelectionConformanceIds.productionOrder2,
          ],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-rejected-plan',
        }),
      ],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:2:false'],
    },
    {
      name: 'matching receipt replays before locks clock IDs and signals',
      fixture: { storedReceipt: 'matching' },
      commands: [
        command({ idempotencyKey: 'replace-selection-matching-replay' }),
      ],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['success:1:true'],
    },
    ...(['malformed', 'divergent'] as const).map((storedReceipt) => ({
      name: `${storedReceipt} receipt returns exact idempotency conflict before locking`,
      fixture: { storedReceipt },
      commands: [
        command({ idempotencyKey: `replace-selection-${storedReceipt}` }),
      ],
      executionMode: 'sequential' as const,
      expectedOutcomeCodes: [
        failure('production_idempotency_conflict'),
      ] as const,
    })),
    ...(
      [
        {
          name: 'missing shift',
          fixture: { shift: 'missing' as const },
          code: 'production_shift_not_found',
        },
        {
          name: 'started shift',
          fixture: { shift: 'started' as const },
          code: 'production_shift_already_started',
        },
        {
          name: 'selection version mismatch',
          fixture: { selection: 'first_v1' as const },
          code: 'production_shift_selection_version_conflict',
        },
        {
          name: 'selected order no longer ready',
          fixture: { readiness: 'not_ready' as const },
          code: 'production_shift_selection_not_ready',
        },
        {
          name: 'selected order missing',
          fixture: { readiness: 'missing' as const },
          code: 'production_shift_selection_not_ready',
        },
        {
          name: 'selected order resolved',
          fixture: { readiness: 'resolved' as const },
          code: 'production_shift_selection_not_ready',
        },
      ] as const
    ).map(({ name, fixture, code }) => ({
      name: `${name} preserves exact guard failure with no receipt or revision`,
      fixture,
      commands: [
        command({
          ...(name === 'selection version mismatch'
            ? { expectedVersion: 0 }
            : {}),
          ...(name === 'selected order missing'
            ? {
                selectedOrderIds: [
                  replaceShiftSelectionConformanceIds.missingProductionOrder,
                ],
              }
            : {}),
          idempotencyKey: `replace-selection-${code}-${name.replaceAll(' ', '-')}`,
        }),
      ],
      executionMode: 'sequential' as const,
      expectedOutcomeCodes: [failure(code)] as const,
    })),
    {
      name: 'same-key identical race misses before lock and replays at the second checkpoint',
      fixture: { fault: 'slow_event_append' },
      commands: [
        command({ idempotencyKey: 'replace-selection-same-key-race' }),
        command({ idempotencyKey: 'replace-selection-same-key-race' }),
      ],
      executionMode: 'concurrent',
      expectedOutcomeCodes: ['success:1:false', 'success:1:true'],
    },
    {
      name: 'same-key divergent race conflicts at the second replay checkpoint',
      fixture: { fault: 'slow_event_append' },
      commands: [
        command({ idempotencyKey: 'replace-selection-divergent-race' }),
        command({
          selectedOrderIds: [
            replaceShiftSelectionConformanceIds.productionOrder3,
          ],
          idempotencyKey: 'replace-selection-divergent-race',
        }),
      ],
      executionMode: 'concurrent',
      expectedOutcomeCodes: [
        failure('production_idempotency_conflict'),
        'success:1:false',
      ],
    },
    {
      name: 'different-key same-version race serializes to one success and one version conflict',
      fixture: { selection: 'first_v1', fault: 'slow_event_append' },
      commands: [
        command({
          selectedOrderIds: [
            replaceShiftSelectionConformanceIds.productionOrder2,
          ],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-version-race-a',
        }),
        command({
          selectedOrderIds: [
            replaceShiftSelectionConformanceIds.productionOrder3,
          ],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-version-race-b',
        }),
      ],
      executionMode: 'concurrent',
      expectedOutcomeCodes: [
        failure('production_shift_selection_version_conflict'),
        'success:2:false',
      ],
    },
    ...(
      [
        {
          fault: 'selection_insert_cas' as const,
          fixture: {},
          expectedVersion: 0,
          code: 'production_shift_selection_version_conflict',
        },
        {
          fault: 'selection_update_cas' as const,
          fixture: { selection: 'first_v1' as const },
          expectedVersion: 1,
          code: 'production_shift_selection_version_conflict',
        },
        {
          fault: 'schedule_cas' as const,
          fixture: {
            selection: 'first_v1' as const,
            currentSchedule: 'draft' as const,
          },
          expectedVersion: 1,
          code: 'production_shift_selection_schedule_version_conflict',
        },
      ] as const
    ).map(({ fault, fixture, expectedVersion, code }) => ({
      name: `${fault} rolls all selection plan receipt and revision effects back`,
      fixture: { ...fixture, fault },
      commands: [
        command({
          selectedOrderIds: [
            replaceShiftSelectionConformanceIds.productionOrder2,
          ],
          expectedVersion,
          idempotencyKey: `replace-selection-${fault}`,
        }),
      ],
      executionMode: 'sequential' as const,
      expectedOutcomeCodes: [failure(code)] as const,
    })),
    {
      name: 'late event ID collision rolls selection plan receipt and revision back',
      fixture: {
        selection: 'first_v1',
        currentSchedule: 'draft',
        fault: 'event_id_collision',
      },
      commands: [
        command({
          selectedOrderIds: [
            replaceShiftSelectionConformanceIds.productionOrder2,
          ],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-event-collision',
        }),
      ],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['unexpected:production_shift_selection_failed'],
    },
    {
      name: 'unknown post-commit supersession signal fault is normalized after durable state',
      fixture: {
        selection: 'first_v1',
        currentSchedule: 'accepted',
        signalFault: true,
      },
      commands: [
        command({
          selectedOrderIds: [
            replaceShiftSelectionConformanceIds.productionOrder2,
          ],
          expectedVersion: 1,
          idempotencyKey: 'replace-selection-signal-fault',
        }),
      ],
      executionMode: 'sequential',
      expectedOutcomeCodes: ['unexpected:production_shift_selection_failed'],
    },
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const canonicalFailure = (
  value: unknown,
): CanonicalReplaceShiftSelectionFailure => {
  const fields = record(value);
  return Object.freeze({
    kind: typeof fields?.['kind'] === 'string' ? fields['kind'] : null,
    code:
      typeof fields?.['code'] === 'string' ? fields['code'] : 'unknown_error',
    message:
      value instanceof Error
        ? value.message
        : typeof fields?.['message'] === 'string'
          ? fields['message']
          : 'Unknown error.',
    safeMessage:
      typeof fields?.['safeMessage'] === 'string'
        ? fields['safeMessage']
        : null,
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  });
};

export const captureReplaceShiftSelectionOutcome = async (
  execute: (command: ReplaceShiftSelectionCommand) => Promise<unknown>,
  command: ReplaceShiftSelectionCommand,
): Promise<CanonicalReplaceShiftSelectionOutcome> => {
  try {
    const raw = await execute(command);
    const carrier = record(raw);
    if (carrier?.['kind'] === 'success' || carrier?.['tag'] === 'ok')
      return Object.freeze({
        kind: 'success',
        value: carrier['value'] as ReplaceShiftSelectionResult,
      });
    if (carrier?.['kind'] === 'failure' || carrier?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['failure'] ?? carrier['error']),
      });
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(raw),
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

export const replaceShiftSelectionOutcomeCode = (
  outcome: CanonicalReplaceShiftSelectionOutcome,
): string =>
  outcome.kind === 'success'
    ? `success:${String(outcome.value.selection.version)}:${String(outcome.value.replayed)}`
    : outcome.kind === 'failure'
      ? `failure:${outcome.failure.code}`
      : `unexpected:${outcome.error.code}`;
