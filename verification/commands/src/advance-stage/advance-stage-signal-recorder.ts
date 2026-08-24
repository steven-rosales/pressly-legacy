import type {
  AdvanceStageSignal,
  AdvanceStageSignalPort,
} from './advance-stage-types.ts';

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const isFreshMutationOutcome = (outcome: unknown): boolean => {
  const fields = record(outcome);
  const value =
    fields?.['tag'] === 'ok' || fields?.['kind'] === 'success'
      ? record(fields['value'])
      : null;
  return (
    typeof value?.['entityId'] === 'string' &&
    typeof value['version'] === 'number' &&
    value['replayed'] === false
  );
};

export type AdvanceStageTransactionRecorder = Readonly<{
  recordCommittedOutcome: (outcome: unknown) => void;
}>;

export type AdvanceStageSignalRecorder = Readonly<{
  signals: AdvanceStageSignalPort;
  transactions: AdvanceStageTransactionRecorder;
  read: () => readonly AdvanceStageSignal[];
}>;

export const makeAdvanceStageSignalRecorder =
  (): AdvanceStageSignalRecorder => {
    let committedMutations = 0;
    const recorded: AdvanceStageSignal[] = [];

    return Object.freeze({
      signals: Object.freeze({
        batchFrozen: (input: Readonly<{ source: 'stage_start' }>): void => {
          recorded.push(
            Object.freeze({
              signal: 'batchFrozen',
              source: input.source,
              afterCommit: committedMutations > recorded.length,
              committedMutationOrdinal: committedMutations,
            }),
          );
        },
      }),
      transactions: Object.freeze({
        recordCommittedOutcome: (outcome: unknown): void => {
          if (isFreshMutationOutcome(outcome)) committedMutations += 1;
        },
      }),
      read: () => Object.freeze([...recorded]),
    });
  };
