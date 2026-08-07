import type {
  OperationalOrderIdentity,
  OperationalOrderIdentityReference,
} from '../../../foundations/language/operational-order/operational-order.model.ts';
import {
  operationalOrderIdentityValues,
  uniqueOperationalOrderReferences,
} from '../../../foundations/language/operational-order/operational-order.policy.ts';
import {
  orderDemandReferenceId,
  productionOrderReferenceId,
} from '../../../foundations/language/operational-order/operational-order.value.ts';
import type { OperationalOrderIdentityPort } from '../../../foundations/ports/operational-order-identity/operational-order-identity.port.ts';
import type {
  ForecastOrderIdentitySource,
  ProductionForecastIdentitySource,
} from './resolve-forecast-order-identities.model.ts';

export type ResolveForecastOrderIdentities = (
  source: ProductionForecastIdentitySource,
) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;

const toForecastReference = (
  order: ForecastOrderIdentitySource,
): OperationalOrderIdentityReference => ({
  referenceId:
    order.productionOrderId === null
      ? orderDemandReferenceId(order.orderDemandId)
      : productionOrderReferenceId(order.productionOrderId),
  productionOrderId: order.productionOrderId,
  orderDemandId: order.orderDemandId,
  fallbackDisplayNumber: order.externalOrderId,
});

export const makeResolveForecastOrderIdentities =
  (identities: OperationalOrderIdentityPort): ResolveForecastOrderIdentities =>
  async (source) =>
    operationalOrderIdentityValues(
      await identities.resolve(
        uniqueOperationalOrderReferences(
          [
            ...source.groups.inProduction,
            ...source.groups.readyToPlace,
            ...source.groups.expectedLater,
            ...source.groups.needsShift,
          ].map(toForecastReference),
        ),
      ),
    );
