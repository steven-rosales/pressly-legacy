import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';

import type {
  GetCanonicalOrder,
  ListCanonicalOrders,
  ReadOrdersRepository,
} from './read-orders.port.ts';
import { readOrdersFailure } from './read-orders.failure.ts';

export const makeListCanonicalOrders =
  (repo: ReadOrdersRepository): ListCanonicalOrders =>
  async (query) => {
    if (
      query.businessId.trim() === '' ||
      query.locationIds.some((id) => id.trim() === '') ||
      query.limit < 1 ||
      query.limit > 100 ||
      (query.query !== null && query.query.trim().length > 120)
    )
      return result.err(readOrdersFailure.invalidList());
    try {
      const outcome = await repo.list({
        ...query,
        query:
          query.query === null || query.query.trim() === ''
            ? null
            : query.query.trim(),
      });
      return outcome.kind === 'ok'
        ? result.ok(outcome.value)
        : result.err(readOrdersFailure.invalidCursor());
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'order_list_failed',
          message: 'Orders could not be loaded.',
          safeMessage: 'Orders could not be loaded.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };

export const makeGetCanonicalOrder =
  (repo: ReadOrdersRepository): GetCanonicalOrder =>
  async (query) => {
    if (
      query.businessId.trim() === '' ||
      query.orderId.trim() === '' ||
      query.locationIds.some((id) => id.trim() === '')
    )
      return result.err(readOrdersFailure.invalidGet());
    try {
      const order = await repo.get(query);
      return order === null
        ? result.err(readOrdersFailure.notFound())
        : result.ok(order);
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'order_get_failed',
          message: 'The Order could not be loaded.',
          safeMessage: 'The Order could not be loaded.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
