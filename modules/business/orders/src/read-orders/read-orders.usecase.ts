import { result } from '@pressly/kernel';
import { orderError } from '../order.error.ts';
import type { GetCanonicalOrder, ListCanonicalOrders } from '../orders.port.ts';
import type { ReadOrdersRepository } from './read-orders.port.ts';

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
      return result.err(
        orderError('ORDER_LIST_INVALID', 'The Order query is invalid.', 400),
      );
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
        : result.err(
            orderError(
              'ORDER_CURSOR_INVALID',
              'The Order page cursor is invalid.',
              400,
            ),
          );
    } catch (error) {
      return result.err(
        orderError(
          'ORDER_LIST_FAILED',
          'Orders could not be loaded.',
          503,
          error,
        ),
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
      return result.err(
        orderError('ORDER_GET_INVALID', 'The Order query is invalid.', 400),
      );
    try {
      const order = await repo.get(query);
      return order === null
        ? result.err(
            orderError('ORDER_NOT_FOUND', 'The Order was not found.', 404),
          )
        : result.ok(order);
    } catch (error) {
      return result.err(
        orderError(
          'ORDER_GET_FAILED',
          'The Order could not be loaded.',
          503,
          error,
        ),
      );
    }
  };
