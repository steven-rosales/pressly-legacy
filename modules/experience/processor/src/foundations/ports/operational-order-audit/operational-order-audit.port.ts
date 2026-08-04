import type { OperationalOrderAuditFacts } from '../../language/operational-order/operational-order.model.ts';

export type OperationalOrderAuditPort = Readonly<{
  load: (input: {
    canonicalOrderIds: readonly string[];
    productionOrderIds: readonly string[];
  }) => Promise<OperationalOrderAuditFacts>;
}>;
