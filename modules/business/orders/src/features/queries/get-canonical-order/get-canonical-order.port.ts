import type { CanonicalOrderDetail } from '../../../foundations/language/canonical-order-read/canonical-order-read.model.ts';
import type { GetCanonicalOrderQuery } from './get-canonical-order.model.ts';

export type GetCanonicalOrderRepository = (
  query: GetCanonicalOrderQuery,
) => Promise<CanonicalOrderDetail | null>;
