import type { OperationalOrderControlContextSource } from './load-operational-order-contexts.model.ts';
import type {
  LoadOperationalOrderAudit,
  LoadOperationalOrderControlContexts,
} from './load-operational-order-contexts.port.ts';
import {
  makeLoadOperationalOrderContexts,
  type LoadOperationalOrderContexts,
} from './load-operational-order-contexts.usecase.ts';
import type { OperationalOrderIdentityPort } from '../../../foundations/ports/operational-order-identity/operational-order-identity.port.ts';

const toOperationalOrderReferences = (
  items: readonly OperationalOrderControlContextSource[],
): Parameters<LoadOperationalOrderContexts>[0] =>
  items.map((item) => ({
    referenceId: item.order.id,
    productionOrderId: item.order.id,
    orderDemandId: null,
    fallbackDisplayNumber: item.order.externalOrderId,
  }));

export const makeLoadOperationalOrderControlContexts = (deps: {
  identities: OperationalOrderIdentityPort;
  loadAudit: LoadOperationalOrderAudit;
}): LoadOperationalOrderControlContexts => {
  const loadContexts = makeLoadOperationalOrderContexts(deps);
  return (items) => loadContexts(toOperationalOrderReferences(items));
};
