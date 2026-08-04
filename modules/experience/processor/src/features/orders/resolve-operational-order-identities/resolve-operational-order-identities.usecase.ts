import type {
  OperationalOrderIdentity,
  OperationalOrderIdentityReference,
  OperationalOrderIdentityResolution,
} from '../../../foundations/language/operational-order/operational-order.model.ts';
import {
  orderDemandReferenceId,
  productionOrderReferenceId,
  uniqueOperationalOrderReferences,
} from '../../../foundations/language/operational-order/operational-order.policy.ts';
import type { OperationalOrderIdentityPort } from '../../../foundations/ports/operational-order-identity/operational-order-identity.port.ts';
import type {
  ProductionBacklogIdentitySource,
  ProductionBoardIdentitySource,
  ProductionForecastIdentitySource,
  ProductionHistoryActivityIdentitySource,
  ProductionHistoryRunIdentitySource,
  ProductionWorkspaceIdentitySource,
} from './resolve-operational-order-identities.model.ts';

export type ResolveOperationalOrderIdentities = (
  references: readonly OperationalOrderIdentityReference[],
) => Promise<ReadonlyMap<string, OperationalOrderIdentityResolution>>;

export const makeResolveOperationalOrderIdentities =
  (
    identities: OperationalOrderIdentityPort,
  ): ResolveOperationalOrderIdentities =>
  async (references) =>
    identities.resolve(uniqueOperationalOrderReferences(references));

const productionReference = (order: {
  id: string;
  externalOrderId: string;
}): OperationalOrderIdentityReference => ({
  referenceId: productionOrderReferenceId(order.id),
  productionOrderId: order.id,
  orderDemandId: null,
  fallbackDisplayNumber: order.externalOrderId,
});

const identityValues = async (
  resolve: ResolveOperationalOrderIdentities,
  references: readonly OperationalOrderIdentityReference[],
): Promise<ReadonlyMap<string, OperationalOrderIdentity>> =>
  new Map(
    [...(await resolve(references)).entries()].map(([referenceId, value]) => [
      referenceId,
      value.identity,
    ]),
  );

export type OperationalOrderIdentityQueries = Readonly<{
  forBoard: (
    source: ProductionBoardIdentitySource,
  ) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;
  forWorkspace: (
    source: ProductionWorkspaceIdentitySource,
  ) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;
  forForecast: (
    source: ProductionForecastIdentitySource,
  ) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;
  forHistoryRun: (
    source: ProductionHistoryRunIdentitySource,
  ) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;
  forBacklog: (
    source: ProductionBacklogIdentitySource,
  ) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;
  forHistoryActivity: (
    source: ProductionHistoryActivityIdentitySource,
  ) => Promise<ReadonlyMap<string, OperationalOrderIdentity>>;
}>;

export const makeOperationalOrderIdentityQueries = (
  identities: OperationalOrderIdentityPort,
): OperationalOrderIdentityQueries => {
  const resolve = makeResolveOperationalOrderIdentities(identities);
  return Object.freeze({
    forBoard: (source) =>
      identityValues(
        resolve,
        source.batches.flatMap((batch) =>
          batch.orders.map(productionReference),
        ),
      ),
    forWorkspace: (source) =>
      identityValues(
        resolve,
        [
          ...source.orders,
          ...source.pendingEligibleOrders,
          ...(source.liveRunChanges?.orders ?? []),
          ...(source.board?.batches.flatMap((batch) => batch.orders) ?? []),
        ].map(productionReference),
      ),
    forForecast: (source) =>
      identityValues(
        resolve,
        [
          ...source.groups.inProduction,
          ...source.groups.readyToPlace,
          ...source.groups.expectedLater,
          ...source.groups.needsShift,
        ].map((order) => ({
          referenceId:
            order.productionOrderId === null
              ? orderDemandReferenceId(order.orderDemandId)
              : productionOrderReferenceId(order.productionOrderId),
          productionOrderId: order.productionOrderId,
          orderDemandId: order.orderDemandId,
          fallbackDisplayNumber: order.externalOrderId,
        })),
      ),
    forHistoryRun: (source) =>
      identityValues(
        resolve,
        source.orderMemberships.map((membership) => ({
          referenceId: productionOrderReferenceId(membership.productionOrderId),
          productionOrderId: membership.productionOrderId,
          orderDemandId: null,
          fallbackDisplayNumber: membership.externalOrderId,
        })),
      ),
    forBacklog: (source) =>
      identityValues(
        resolve,
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
    forHistoryActivity: (source) =>
      identityValues(
        resolve,
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
  });
};
