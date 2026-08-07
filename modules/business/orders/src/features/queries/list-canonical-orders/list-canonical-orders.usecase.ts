import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import {
  listCanonicalOrdersFailure,
  type ListCanonicalOrdersFailure,
} from './list-canonical-orders.failure.ts';
import type {
  CanonicalOrderListResult,
  ListCanonicalOrdersQuery,
} from './list-canonical-orders.model.ts';
import type { ListCanonicalOrdersRepository } from './list-canonical-orders.port.ts';

export type ListCanonicalOrders = (
  query: ListCanonicalOrdersQuery,
) => Promise<Result<CanonicalOrderListResult, ListCanonicalOrdersFailure>>;

export const makeListCanonicalOrders =
  (listOrders: ListCanonicalOrdersRepository): ListCanonicalOrders =>
  async (query) => {
    if (
      query.businessId.trim() === '' ||
      query.locationIds.some((id) => id.trim() === '') ||
      query.limit < 1 ||
      query.limit > 100 ||
      (query.query !== null && query.query.trim().length > 120)
    )
      return result.err(listCanonicalOrdersFailure.invalidQuery());

    try {
      const outcome = await listOrders({
        ...query,
        query:
          query.query === null || query.query.trim() === ''
            ? null
            : query.query.trim(),
      });
      return outcome.kind === 'ok'
        ? result.ok(outcome.value)
        : result.err(listCanonicalOrdersFailure.invalidCursor());
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
