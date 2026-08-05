import type {
  OperationalOrderAuditFacts,
  OperationalOrderContextResolution,
} from '../../../foundations/language/operational-order/operational-order.model.ts';
import type { OperationalOrderControlContextSource } from './load-operational-order-contexts.model.ts';

export type LoadOperationalOrderControlContexts = (
  items: readonly OperationalOrderControlContextSource[],
) => Promise<ReadonlyMap<string, OperationalOrderContextResolution>>;

export type LoadOperationalOrderAudit = (input: {
  canonicalOrderIds: readonly string[];
  productionOrderIds: readonly string[];
}) => Promise<OperationalOrderAuditFacts>;
