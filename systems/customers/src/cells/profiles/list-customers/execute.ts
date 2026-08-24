import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  normalizeListCustomersQuery,
  validateListCustomers,
} from './decide.ts';
import type {
  ListCustomersExpectedFailure,
  ListCustomersQuery,
  ListCustomersRepository,
  ListCustomersResult,
} from './types.ts';

export type ExecuteListCustomers = (
  query: ListCustomersQuery,
) => Promise<CellOutcome<ListCustomersResult, ListCustomersExpectedFailure>>;

export const makeExecuteListCustomers = (
  listCustomers: ListCustomersRepository,
): ExecuteListCustomers =>
  async function executeListCustomers(query) {
    const expectedFailure = validateListCustomers(query);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const outcome = await listCustomers(normalizeListCustomersQuery(query));
      return outcome.kind === 'ok'
        ? { kind: 'success', value: outcome.value }
        : {
            kind: 'failure',
            failure: { kind: 'validation', code: 'user_cursor_invalid' },
          };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'user_list_failed',
          message: 'Customers could not be loaded.',
          safeMessage: 'Customers could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
