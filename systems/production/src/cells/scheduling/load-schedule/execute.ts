import type { CellOutcome } from '@pressly/cells';
import type { ScheduleProposal } from '../../../read-models/production-schedule/contract.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { loadScheduleNotFound } from './failures.ts';
import type {
  LoadScheduleExpectedFailure,
  LoadScheduleInput,
  LoadScheduleRepository,
} from './types.ts';

export type ExecuteLoadSchedule = (
  input: LoadScheduleInput,
) => Promise<CellOutcome<ScheduleProposal, LoadScheduleExpectedFailure>>;

export const makeExecuteLoadSchedule =
  (repository: LoadScheduleRepository): ExecuteLoadSchedule =>
  async (input) => {
    let proposal;
    try {
      proposal = await repository.load(input);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'schedule_load_failed',
          message: 'The schedule proposal could not be loaded.',
          safeMessage: 'The schedule proposal could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }

    return proposal === null
      ? { kind: 'failure', failure: loadScheduleNotFound() }
      : { kind: 'success', value: proposal };
  };
