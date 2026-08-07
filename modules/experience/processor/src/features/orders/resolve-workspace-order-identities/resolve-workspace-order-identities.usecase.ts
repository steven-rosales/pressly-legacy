import type { OperationalOrderIdentity } from '../../../foundations/language/operational-order/operational-order.model.ts';
import {
  operationalOrderIdentityValues,
  productionOrderIdentityReference,
  uniqueOperationalOrderReferences,
} from '../../../foundations/language/operational-order/operational-order.policy.ts';
import type { OperationalOrderIdentityPort } from '../../../foundations/ports/operational-order-identity/operational-order-identity.port.ts';
import type { ProductionWorkspaceIdentitySource } from './resolve-workspace-order-identities.model.ts';

export type ResolveWorkspaceOrderIdentities = (
  source: ProductionWorkspaceIdentitySource,
) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;

export const makeResolveWorkspaceOrderIdentities =
  (identities: OperationalOrderIdentityPort): ResolveWorkspaceOrderIdentities =>
  async (source) =>
    operationalOrderIdentityValues(
      await identities.resolve(
        uniqueOperationalOrderReferences(
          [
            ...source.orders,
            ...source.pendingEligibleOrders,
            ...(source.liveRunChanges?.orders ?? []),
            ...(source.board?.batches.flatMap((batch) => batch.orders) ?? []),
          ].map(productionOrderIdentityReference),
        ),
      ),
    );
