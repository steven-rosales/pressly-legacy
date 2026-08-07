import type { OperationalOrderIdentity } from '../../../foundations/language/operational-order/operational-order.model.ts';
import {
  operationalOrderIdentityValues,
  uniqueOperationalOrderReferences,
} from '../../../foundations/language/operational-order/operational-order.policy.ts';
import { productionOrderReferenceId } from '../../../foundations/language/operational-order/operational-order.value.ts';
import type { OperationalOrderIdentityPort } from '../../../foundations/ports/operational-order-identity/operational-order-identity.port.ts';
import type { ProductionBacklogIdentitySource } from './resolve-backlog-order-identities.model.ts';

export type ResolveBacklogOrderIdentities = (
  source: ProductionBacklogIdentitySource,
) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;

export const makeResolveBacklogOrderIdentities =
  (identities: OperationalOrderIdentityPort): ResolveBacklogOrderIdentities =>
  async (source) =>
    operationalOrderIdentityValues(
      await identities.resolve(
        uniqueOperationalOrderReferences(
          [
            ...source.groups.readyToArchive,
            ...source.groups.reviewIndividually,
            ...source.groups.keptForSafety,
            ...source.groups.alreadyHistorical,
          ].map((order) => ({
            referenceId: productionOrderReferenceId(order.orderId),
            productionOrderId: order.orderId,
            orderDemandId: null,
            fallbackDisplayNumber: order.displayReference,
          })),
        ),
      ),
    );
