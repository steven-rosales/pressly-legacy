import type {
  AttemptAutomaticPlacementDecision,
  StartedProductionRun,
} from './types.ts';

export const decideAutomaticPlacementRun = (
  runs: readonly StartedProductionRun[],
): AttemptAutomaticPlacementDecision => {
  const [onlyRun] = runs;
  if (runs.length === 1 && onlyRun !== undefined)
    return { kind: 'place', run: onlyRun };
  if (runs.length === 0)
    return {
      kind: 'record',
      placement: {
        status: 'awaiting_run',
        reason: 'no_started_run',
        message: 'This order is waiting for a production run to start.',
      },
    };
  return {
    kind: 'record',
    placement: {
      status: 'ambiguous_run',
      reason: 'multiple_started_runs',
      message:
        'More than one production run is active; choose the intended run before placing this order.',
      candidateProductionRunIds: runs.map((run) => run.productionRunId).sort(),
    },
  };
};
