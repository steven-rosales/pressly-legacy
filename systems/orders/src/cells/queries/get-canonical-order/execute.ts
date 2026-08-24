import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { CanonicalOrderDetail } from '../../../model/canonical-order/model.ts';
import { canonicalOrderNotFound, validateGetCanonicalOrder } from './decide.ts';
import type {
  GetCanonicalOrderExpectedFailure,
  GetCanonicalOrderQuery,
  GetCanonicalOrderRepository,
} from './types.ts';

export const makeExecuteGetCanonicalOrder =
  (repository: GetCanonicalOrderRepository) =>
  async (
    query: GetCanonicalOrderQuery,
  ): Promise<
    CellOutcome<CanonicalOrderDetail, GetCanonicalOrderExpectedFailure>
  > => {
    const expectedFailure = validateGetCanonicalOrder(query);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const order = await repository.get(query);
      return order === null
        ? { kind: 'failure', failure: canonicalOrderNotFound() }
        : { kind: 'success', value: order };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_get_failed',
          message: 'The Order could not be loaded.',
          safeMessage: 'The Order could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
