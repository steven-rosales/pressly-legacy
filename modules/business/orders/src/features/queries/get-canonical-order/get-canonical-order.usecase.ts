import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import type { CanonicalOrderDetail } from '../../../foundations/language/canonical-order-read/canonical-order-read.model.ts';
import {
  getCanonicalOrderFailure,
  type GetCanonicalOrderFailure,
} from './get-canonical-order.failure.ts';
import type { GetCanonicalOrderQuery } from './get-canonical-order.model.ts';
import type { GetCanonicalOrderRepository } from './get-canonical-order.port.ts';

export type GetCanonicalOrder = (
  query: GetCanonicalOrderQuery,
) => Promise<Result<CanonicalOrderDetail, GetCanonicalOrderFailure>>;

export const makeGetCanonicalOrder =
  (getOrder: GetCanonicalOrderRepository): GetCanonicalOrder =>
  async (query) => {
    if (
      query.businessId.trim() === '' ||
      query.orderId.trim() === '' ||
      query.locationIds.some((id) => id.trim() === '')
    )
      return result.err(getCanonicalOrderFailure.invalidQuery());

    try {
      const order = await getOrder(query);
      return order === null
        ? result.err(getCanonicalOrderFailure.notFound())
        : result.ok(order);
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
