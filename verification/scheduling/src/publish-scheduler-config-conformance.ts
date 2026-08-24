import type { PublishSchedulerConfigCommand } from '@pressly/production-system/operations/scheduling/publish-scheduler-config/types';

// Conformance scenarios for the current Production operation.

const uuid = (suffix: number): string =>
  `26000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const publishSchedulerConfigConformanceLocationId =
  'publish-scheduler-config-conformance-location';

export const publishSchedulerConfigConformanceIds = Object.freeze({
  business: uuid(1),
  actor: uuid(2),
  historicalConfig: uuid(3),
  currentConfig: uuid(4),
  createdConfig: uuid(5),
  createdEvent: uuid(6),
  rollbackConfig: uuid(7),
  collisionEvent: uuid(8),
  raceWinnerConfig: uuid(9),
  raceWinnerEvent: uuid(10),
  raceLoserConfig: uuid(11),
  fixtureEntity: uuid(12),
  raceLoserEvent: uuid(13),
});

const baseCommand = Object.freeze({
  locationId: publishSchedulerConfigConformanceLocationId,
  actorId: publishSchedulerConfigConformanceIds.actor,
  pulseMinutes: 56,
  foldLbsPerFolderMinute: 2,
  stageFitAssertion: Object.freeze({
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
  }),
  idempotencyKey: 'publish-scheduler-config-conformance-1',
}) satisfies PublishSchedulerConfigCommand;

export const makePublishSchedulerConfigConformanceCommand = (
  overrides: Partial<PublishSchedulerConfigCommand> = {},
): PublishSchedulerConfigCommand =>
  Object.freeze({
    ...baseCommand,
    ...overrides,
    stageFitAssertion:
      overrides.stageFitAssertion ?? baseCommand.stageFitAssertion,
  });

export type PublishSchedulerConfigConformanceFixture =
  | 'baseline'
  | 'late-event-collision';

export type PublishSchedulerConfigConformanceScenario = Readonly<{
  name: string;
  fixture: PublishSchedulerConfigConformanceFixture;
  commands: readonly PublishSchedulerConfigCommand[];
  generatedIds: readonly string[];
  expectedOutcomeCodes: readonly string[];
  expectedConfigDelta: number;
  expectedWorkEventDelta: number;
  expectedClockReads: number;
  expectedIdReads: number;
  expectedDatabaseCalls: readonly PublishSchedulerConfigDatabaseCall[];
}>;

export const publishSchedulerConfigConformanceScenarios: readonly PublishSchedulerConfigConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'latest location version plus one commits the exact v2 config and receipt',
      fixture: 'baseline' as const,
      commands: Object.freeze([baseCommand]),
      generatedIds: Object.freeze([
        publishSchedulerConfigConformanceIds.createdConfig,
        publishSchedulerConfigConformanceIds.createdEvent,
      ]),
      expectedOutcomeCodes: Object.freeze(['success']),
      expectedConfigDelta: 1,
      expectedWorkEventDelta: 1,
      expectedClockReads: 1,
      expectedIdReads: 2,
      expectedDatabaseCalls: Object.freeze([
        'transaction',
        'find_work_event',
        'execute_sql',
        'find_work_event',
        'next_scheduler_config_version',
        'save_scheduler_config',
        'append_work_event',
      ] as const),
    }),
    Object.freeze({
      name: 'non-positive pulse is rejected before transaction, clock, or identifiers',
      fixture: 'baseline' as const,
      commands: Object.freeze([
        makePublishSchedulerConfigConformanceCommand({
          pulseMinutes: 0,
          idempotencyKey: 'publish-scheduler-config-invalid-pulse',
        }),
      ]),
      generatedIds: Object.freeze([]),
      expectedOutcomeCodes: Object.freeze(['scheduler_config_invalid']),
      expectedConfigDelta: 0,
      expectedWorkEventDelta: 0,
      expectedClockReads: 0,
      expectedIdReads: 0,
      expectedDatabaseCalls: Object.freeze([]),
    }),
    Object.freeze({
      name: 'non-positive fold rate is rejected before transaction, clock, or identifiers',
      fixture: 'baseline' as const,
      commands: Object.freeze([
        makePublishSchedulerConfigConformanceCommand({
          foldLbsPerFolderMinute: 0,
          idempotencyKey: 'publish-scheduler-config-invalid-fold-rate',
        }),
      ]),
      generatedIds: Object.freeze([]),
      expectedOutcomeCodes: Object.freeze(['scheduler_config_invalid']),
      expectedConfigDelta: 0,
      expectedWorkEventDelta: 0,
      expectedClockReads: 0,
      expectedIdReads: 0,
      expectedDatabaseCalls: Object.freeze([]),
    }),
    Object.freeze({
      name: 'exact retry performs one pre-write replay check and returns the original result',
      fixture: 'baseline' as const,
      commands: Object.freeze([baseCommand, baseCommand]),
      generatedIds: Object.freeze([
        publishSchedulerConfigConformanceIds.createdConfig,
        publishSchedulerConfigConformanceIds.createdEvent,
      ]),
      expectedOutcomeCodes: Object.freeze(['success', 'success']),
      expectedConfigDelta: 1,
      expectedWorkEventDelta: 1,
      expectedClockReads: 1,
      expectedIdReads: 2,
      expectedDatabaseCalls: Object.freeze([
        'transaction',
        'find_work_event',
        'execute_sql',
        'find_work_event',
        'next_scheduler_config_version',
        'save_scheduler_config',
        'append_work_event',
        'transaction',
        'find_work_event',
      ] as const),
    }),
    Object.freeze({
      name: 'same key with divergent payload returns the exact typed conflict',
      fixture: 'baseline' as const,
      commands: Object.freeze([
        baseCommand,
        makePublishSchedulerConfigConformanceCommand({
          foldLbsPerFolderMinute: 3,
        }),
      ]),
      generatedIds: Object.freeze([
        publishSchedulerConfigConformanceIds.createdConfig,
        publishSchedulerConfigConformanceIds.createdEvent,
      ]),
      expectedOutcomeCodes: Object.freeze([
        'success',
        'production_idempotency_conflict',
      ]),
      expectedConfigDelta: 1,
      expectedWorkEventDelta: 1,
      expectedClockReads: 1,
      expectedIdReads: 2,
      expectedDatabaseCalls: Object.freeze([
        'transaction',
        'find_work_event',
        'execute_sql',
        'find_work_event',
        'next_scheduler_config_version',
        'save_scheduler_config',
        'append_work_event',
        'transaction',
        'find_work_event',
      ] as const),
    }),
    Object.freeze({
      name: 'late receipt failure rolls config and live revision back',
      fixture: 'late-event-collision' as const,
      commands: Object.freeze([
        makePublishSchedulerConfigConformanceCommand({
          idempotencyKey: 'publish-scheduler-config-late-rollback',
        }),
      ]),
      generatedIds: Object.freeze([
        publishSchedulerConfigConformanceIds.rollbackConfig,
        publishSchedulerConfigConformanceIds.collisionEvent,
      ]),
      expectedOutcomeCodes: Object.freeze(['scheduler_config_publish_failed']),
      expectedConfigDelta: 0,
      expectedWorkEventDelta: 0,
      expectedClockReads: 1,
      expectedIdReads: 2,
      expectedDatabaseCalls: Object.freeze([
        'transaction',
        'find_work_event',
        'execute_sql',
        'find_work_event',
        'next_scheduler_config_version',
        'save_scheduler_config',
        'append_work_event',
      ] as const),
    }),
  ]);

export type CanonicalPublishSchedulerConfigFailure = Readonly<{
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalPublishSchedulerConfigOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalPublishSchedulerConfigFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalPublishSchedulerConfigFailure;
    }>;

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const stringField = (
  fields: Readonly<Record<string, unknown>> | null,
  key: string,
): string | null => (typeof fields?.[key] === 'string' ? fields[key] : null);

const canonicalFailure = (
  value: unknown,
): CanonicalPublishSchedulerConfigFailure => {
  const fields = record(value);
  return Object.freeze({
    kind: stringField(fields, 'kind') ?? 'unknown',
    classification: stringField(fields, 'classification'),
    code: stringField(fields, 'code') ?? 'unknown_error',
    message:
      value instanceof Error
        ? value.message
        : (stringField(fields, 'message') ?? 'Unknown error.'),
    safeMessage: stringField(fields, 'safeMessage'),
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  });
};

export const capturePublishSchedulerConfigOutcome = async (
  execute: (command: PublishSchedulerConfigCommand) => Promise<unknown>,
  command: PublishSchedulerConfigCommand,
): Promise<CanonicalPublishSchedulerConfigOutcome> => {
  try {
    const raw = await execute(command);
    const wrapper = record(raw);
    if (wrapper?.['tag'] === 'ok' || wrapper?.['kind'] === 'success')
      return Object.freeze({ kind: 'success', value: wrapper['value'] });
    if (wrapper?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(wrapper['error']),
      });
    if (wrapper?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(wrapper['failure']),
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

export const publishSchedulerConfigOutcomeCode = (
  outcome: CanonicalPublishSchedulerConfigOutcome,
): string =>
  outcome.kind === 'success'
    ? 'success'
    : outcome.kind === 'failure'
      ? outcome.failure.code
      : outcome.error.code;

export type PublishSchedulerConfigState = Readonly<{
  configs: readonly Readonly<Record<string, unknown>>[];
  workEvents: readonly Readonly<Record<string, unknown>>[];
  idempotencyReceipts: readonly unknown[];
  liveRevision: number;
}>;

export type PublishSchedulerConfigDatabaseCall =
  | 'append_work_event'
  | 'execute_sql'
  | 'find_work_event'
  | 'next_scheduler_config_version'
  | 'save_scheduler_config'
  | 'transaction';

export type PublishSchedulerConfigTransactionObservation = Readonly<{
  operation: string;
  outcome: 'committed' | 'expected_rollback' | 'failed';
}>;

export type PublishSchedulerConfigObservation = Readonly<{
  requests: readonly PublishSchedulerConfigCommand[];
  outcomes: readonly CanonicalPublishSchedulerConfigOutcome[];
  before: PublishSchedulerConfigState;
  after: PublishSchedulerConfigState;
  clockReads: number;
  idValues: readonly string[];
  databaseCalls: readonly PublishSchedulerConfigDatabaseCall[];
  transactionTelemetry: readonly PublishSchedulerConfigTransactionObservation[];
}>;
