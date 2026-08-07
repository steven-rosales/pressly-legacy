import type { OperationalOrderIdentity } from '../../../foundations/language/operational-order/operational-order.model.ts';
import {
  operationalOrderIdentityValues,
  uniqueOperationalOrderReferences,
} from '../../../foundations/language/operational-order/operational-order.policy.ts';
import { productionOrderReferenceId } from '../../../foundations/language/operational-order/operational-order.value.ts';
import type { OperationalOrderIdentityPort } from '../../../foundations/ports/operational-order-identity/operational-order-identity.port.ts';
import type { ProductionHistoryRunIdentitySource } from './resolve-history-run-order-identities.model.ts';

export type ResolveHistoryRunOrderIdentities = (
  source: ProductionHistoryRunIdentitySource,
) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;

export const makeResolveHistoryRunOrderIdentities =
  (
    identities: OperationalOrderIdentityPort,
  ): ResolveHistoryRunOrderIdentities =>
  async (source) =>
    operationalOrderIdentityValues(
      await identities.resolve(
        uniqueOperationalOrderReferences(
          source.orderMemberships.map((membership) => ({
            referenceId: productionOrderReferenceId(
              membership.productionOrderId,
            ),
            productionOrderId: membership.productionOrderId,
            orderDemandId: null,
            fallbackDisplayNumber: membership.externalOrderId,
          })),
        ),
      ),
    );
