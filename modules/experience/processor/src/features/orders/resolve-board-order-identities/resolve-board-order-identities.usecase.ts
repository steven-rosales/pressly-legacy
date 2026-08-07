import type {
  OperationalOrderIdentity,
  ProductionBoardIdentitySource,
} from '../../../foundations/language/operational-order/operational-order.model.ts';
import {
  operationalOrderIdentityValues,
  productionOrderIdentityReference,
  uniqueOperationalOrderReferences,
} from '../../../foundations/language/operational-order/operational-order.policy.ts';
import type { OperationalOrderIdentityPort } from '../../../foundations/ports/operational-order-identity/operational-order-identity.port.ts';

export type ResolveBoardOrderIdentities = (
  source: ProductionBoardIdentitySource,
) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;

export const makeResolveBoardOrderIdentities =
  (identities: OperationalOrderIdentityPort): ResolveBoardOrderIdentities =>
  async (source) =>
    operationalOrderIdentityValues(
      await identities.resolve(
        uniqueOperationalOrderReferences(
          source.batches.flatMap((batch) =>
            batch.orders.map(productionOrderIdentityReference),
          ),
        ),
      ),
    );
