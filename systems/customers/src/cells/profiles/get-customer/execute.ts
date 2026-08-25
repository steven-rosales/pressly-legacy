import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { CustomerSummary } from '../../../model/customer.ts';
import { validateGetCustomer } from './decide.ts';
import type {
  GetCustomerExpectedFailure,
  GetCustomerQuery,
  GetCustomerRepository,
} from './types.ts';

export type ExecuteGetCustomer = (
  query: GetCustomerQuery,
) => Promise<CellOutcome<CustomerSummary, GetCustomerExpectedFailure>>;

export const makeExecuteGetCustomer = (
  getCustomer: GetCustomerRepository,
): ExecuteGetCustomer =>
  async function executeGetCustomer(query) {
    const expectedFailure = validateGetCustomer(query);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const customer = await getCustomer(query);
      return customer === null
        ? {
            kind: 'failure',
            failure: { kind: 'not_found', code: 'user_not_found' },
          }
        : { kind: 'success', value: customer };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'user_get_failed',
          message: 'The customer could not be loaded.',
          safeMessage: 'The customer could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
