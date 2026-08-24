import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  ResolveExactSourceCustomerCommand,
  ResolveExactSourceCustomerExpectedFailure,
  ResolveExactSourceCustomerRepository,
  ResolveExactSourceCustomerResult,
} from './types.ts';

export type ExecuteResolveExactSourceCustomer = (
  command: ResolveExactSourceCustomerCommand,
) => Promise<
  CellOutcome<
    ResolveExactSourceCustomerResult,
    ResolveExactSourceCustomerExpectedFailure
  >
>;

export const mapResolveExactSourceCustomerFailure = async (
  action: () => ReturnType<ExecuteResolveExactSourceCustomer>,
): ReturnType<ExecuteResolveExactSourceCustomer> => {
  try {
    return await action();
  } catch (error) {
    throw mapUnknownError(error, (cause) =>
      databaseError({
        code: 'canonical_source_user_resolution_failed',
        message: 'The canonical source user could not be resolved.',
        safeMessage: 'The canonical source user could not be resolved.',
        status: 503,
        cause,
      }),
    );
  }
};

export const makeExecuteResolveExactSourceCustomer =
  (
    repository: ResolveExactSourceCustomerRepository,
  ): ExecuteResolveExactSourceCustomer =>
  (command) =>
    mapResolveExactSourceCustomerFailure(() =>
      repository.transaction((resolve) => resolve(command)),
    );
