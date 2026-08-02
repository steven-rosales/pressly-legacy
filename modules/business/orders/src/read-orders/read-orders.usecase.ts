import {
  databaseError,
  mapUnknownError,
  notFoundError,
  validationError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';

import type {
  GetCanonicalOrder,
  ListCanonicalOrders,
  ReadOrdersRepository,
} from './read-orders.port.ts';

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
        validationError({
          code: 'order_list_invalid',
          message: 'The Order query is invalid.',
          safeMessage: 'The Order query is invalid.',
        }),
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
            validationError({
              code: 'order_cursor_invalid',
              message: 'The Order page cursor is invalid.',
              safeMessage: 'The Order page cursor is invalid.',
            }),
          );
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'order_list_failed',
            message: 'Orders could not be loaded.',
            safeMessage: 'Orders could not be loaded.',
            status: 503,
            cause: unknownCause,
          }),
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
        validationError({
          code: 'order_get_invalid',
          message: 'The Order query is invalid.',
          safeMessage: 'The Order query is invalid.',
        }),
      );
    try {
      const order = await repo.get(query);
      return order === null
        ? result.err(
            notFoundError({
              code: 'order_not_found',
              message: 'The Order was not found.',
              safeMessage: 'The Order was not found.',
            }),
          )
        : result.ok(order);
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'order_get_failed',
            message: 'The Order could not be loaded.',
            safeMessage: 'The Order could not be loaded.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
