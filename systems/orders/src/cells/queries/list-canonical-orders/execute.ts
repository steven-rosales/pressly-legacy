import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { decodeOrderCursor } from '../../../model/canonical-order/policy.ts';
import {
  invalidOrderCursor,
  normalizeListCanonicalOrders,
  validateListCanonicalOrders,
} from './decide.ts';
import type {
  CanonicalOrderListResult,
  ListCanonicalOrdersExpectedFailure,
  ListCanonicalOrdersQuery,
  ListCanonicalOrdersRepository,
} from './types.ts';

export const makeExecuteListCanonicalOrders =
  (repository: ListCanonicalOrdersRepository) =>
  async (
    query: ListCanonicalOrdersQuery,
  ): Promise<
    CellOutcome<CanonicalOrderListResult, ListCanonicalOrdersExpectedFailure>
  > => {
    const expectedFailure = validateListCanonicalOrders(query);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const normalized = normalizeListCanonicalOrders(query);
      const cursor =
        normalized.cursor === null
          ? null
          : decodeOrderCursor(normalized, normalized.cursor);
      if (normalized.cursor !== null && cursor === null)
        return { kind: 'failure', failure: invalidOrderCursor() };
      if (normalized.locationIds.length === 0)
        return {
          kind: 'success',
          value: { items: [], nextCursor: null },
        };

      return {
        kind: 'success',
        value: await repository.list({ query: normalized, cursor }),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_list_failed',
          message: 'Orders could not be loaded.',
          safeMessage: 'Orders could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
