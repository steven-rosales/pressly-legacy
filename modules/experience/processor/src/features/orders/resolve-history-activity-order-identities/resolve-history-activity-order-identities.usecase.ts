import type { OperationalOrderIdentity } from '../../../foundations/language/operational-order/operational-order.model.ts';
import {
  operationalOrderIdentityValues,
  uniqueOperationalOrderReferences,
} from '../../../foundations/language/operational-order/operational-order.policy.ts';
import { productionOrderReferenceId } from '../../../foundations/language/operational-order/operational-order.value.ts';
import type { OperationalOrderIdentityPort } from '../../../foundations/ports/operational-order-identity/operational-order-identity.port.ts';
import type { ProductionHistoryActivityIdentitySource } from './resolve-history-activity-order-identities.model.ts';

export type ResolveHistoryActivityOrderIdentities = (
  source: ProductionHistoryActivityIdentitySource,
) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;

export const makeResolveHistoryActivityOrderIdentities =
  (
    identities: OperationalOrderIdentityPort,
  ): ResolveHistoryActivityOrderIdentities =>
  async (source) =>
    operationalOrderIdentityValues(
      await identities.resolve(
        uniqueOperationalOrderReferences(
          source.items.flatMap((item) =>
            item.entityType !== 'production_order'
              ? []
              : [
                  {
                    referenceId: productionOrderReferenceId(item.entityId),
                    productionOrderId: item.entityId,
                    orderDemandId: null,
                    fallbackDisplayNumber: item.entityId,
                  },
                ],
          ),
        ),
      ),
    );
