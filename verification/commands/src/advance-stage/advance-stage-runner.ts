import type { PostgresDatabase } from '@pressly/postgres/client';
import type { IdSource } from '@pressly/cells/id-source';
import type { AdvanceStageCommand } from '@pressly/production-system/operations/floor/advance-stage/types';
import type { Clock } from '@pressly/time';
import { toCanonicalValue } from './command-observation.ts';
import type { AdvanceStageTransactionRecorder } from './advance-stage-signal-recorder.ts';
import type { AdvanceStagePreLockMissBarrier } from './advance-stage-synchronization.ts';
import type {
  AdvanceStageCanonicalFailure,
  AdvanceStageCanonicalOutcome,
  AdvanceStageCanonicalValue,
  AdvanceStageExecutionMode,
  AdvanceStageRunner,
  AdvanceStageSignalPort,
} from './advance-stage-types.ts';

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const stringField = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
  fallback: string,
): string => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : fallback;
};

const nullableStringField = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const nullableNumberField = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): number | null => {
  const candidate = value?.[field];
  return typeof candidate === 'number' ? candidate : null;
};

const canonicalFailure = (value: unknown): AdvanceStageCanonicalFailure => {
  const fields = record(value);
  return Object.freeze({
    code: stringField(fields, 'code', 'unknown_error'),
    kind: stringField(fields, 'kind', 'unknown'),
    message:
      value instanceof Error
        ? value.message
        : stringField(fields, 'message', 'Unknown error.'),
    safeMessage: nullableStringField(fields, 'safeMessage'),
    status: nullableNumberField(fields, 'status'),
  });
};

const canonicalValue = (value: unknown): AdvanceStageCanonicalValue | null => {
  const fields = record(value);
  if (fields === null) return null;
  if (fields['status'] === 'confirmation_required') {
    const stageRunId = fields['stageRunId'];
    const stageVersion = fields['stageVersion'];
    const replayed = fields['replayed'];
    if (
      typeof stageRunId !== 'string' ||
      typeof stageVersion !== 'number' ||
      replayed !== false
    )
      return null;
    return Object.freeze({
      kind: 'confirmation-required',
      code: stringField(fields, 'code', 'unknown_confirmation'),
      stageRunId,
      stageVersion,
      message: stringField(fields, 'message', 'Confirmation required.'),
      confirmation: toCanonicalValue(fields['confirmation']) ?? null,
      timing: toCanonicalValue(fields['timing']) ?? null,
      replayed,
    });
  }

  const entityId = fields['entityId'];
  const version = fields['version'];
  const replayed = fields['replayed'];
  return typeof entityId === 'string' &&
    typeof version === 'number' &&
    typeof replayed === 'boolean'
    ? Object.freeze({ kind: 'mutation', entityId, version, replayed })
    : null;
};

const invalidOutcome = (value: unknown): AdvanceStageCanonicalOutcome =>
  Object.freeze({
    kind: 'unexpected',
    error: Object.freeze({
      code: 'invalid_advance_stage_outcome',
      kind: 'invalid_result',
      message: JSON.stringify(toCanonicalValue(value) ?? null),
      safeMessage: null,
      status: null,
    }),
  });

export const captureAdvanceStageOutcome = async (
  execute: (command: AdvanceStageCommand) => Promise<unknown>,
  command: AdvanceStageCommand,
): Promise<AdvanceStageCanonicalOutcome> => {
  try {
    const raw = await execute(command);
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
    const canonical = canonicalValue(value);
    return canonical === null
      ? invalidOutcome(raw)
      : Object.freeze({ kind: 'success', value: canonical });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

export type AdvanceStageRunnerDependencies = Readonly<{
  db: PostgresDatabase;
  clock: Clock;
  ids: IdSource;
  signals: AdvanceStageSignalPort;
  transactionSignals: AdvanceStageTransactionRecorder;
  preLockMissBarrier?: AdvanceStagePreLockMissBarrier;
}>;

const sortOutcomes = (
  outcomes: readonly AdvanceStageCanonicalOutcome[],
): readonly AdvanceStageCanonicalOutcome[] =>
  Object.freeze(
    [...outcomes].sort((left, right) =>
      JSON.stringify(toCanonicalValue(left)).localeCompare(
        JSON.stringify(toCanonicalValue(right)),
      ),
    ),
  );

const runCommands = async (
  execute: (command: AdvanceStageCommand) => Promise<unknown>,
  commands: readonly AdvanceStageCommand[],
  executionMode: AdvanceStageExecutionMode,
): Promise<readonly AdvanceStageCanonicalOutcome[]> =>
  executionMode === 'concurrent'
    ? sortOutcomes(
        await Promise.all(
          commands.map((command) =>
            captureAdvanceStageOutcome(execute, command),
          ),
        ),
      )
    : Object.freeze(
        await commands.reduce<Promise<AdvanceStageCanonicalOutcome[]>>(
          async (pending, command) => {
            const outcomes = await pending;
            outcomes.push(await captureAdvanceStageOutcome(execute, command));
            return outcomes;
          },
          Promise.resolve([]),
        ),
      );

export const makeCanonicalAdvanceStageRunner =
  (
    execute: (command: AdvanceStageCommand) => Promise<unknown>,
  ): AdvanceStageRunner =>
  (commands, executionMode) =>
    runCommands(execute, commands, executionMode);
