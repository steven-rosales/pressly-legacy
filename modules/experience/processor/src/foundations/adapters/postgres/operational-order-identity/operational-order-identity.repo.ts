import type { Database } from '@pressly/db/client';
import { eq, inArray, or } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import * as orders from '@pressly/db/schema/orders';
import * as users from '@pressly/db/schema/users';
import type {
  CanonicalOrderContext,
  OperationalOrderIdentityReference,
  OperationalOrderIdentityResolution,
} from '../../../language/operational-order/operational-order.model.ts';
import { canonicalCustomerDisplayName } from '../../../language/operational-order/operational-order.policy.ts';
import type { OperationalOrderIdentityPort } from '../../../ports/operational-order-identity/operational-order-identity.port.ts';
import {
  admissionStateFromPersistence,
  commercialStateFromPersistence,
  customerResolutionFromPersistence,
} from './operational-order-identity.persistence.mapper.ts';

const uniqueNonNull = (values: readonly (string | null)[]): string[] => [
  ...new Set(values.filter((value): value is string => value !== null)),
];

const fallbackResolution = (
  reference: OperationalOrderIdentityReference,
): OperationalOrderIdentityResolution => ({
  identity: {
    displayNumber: reference.fallbackDisplayNumber,
    customerDisplayName: null,
  },
  canonical: null,
});

export const makePostgresOperationalOrderIdentities = (
  db: Database,
): OperationalOrderIdentityPort => ({
  resolve: async (references) => {
    if (references.length === 0) return new Map();

    const productionOrderIds = uniqueNonNull(
      references.map((reference) => reference.productionOrderId),
    );
    const orderDemandIds = uniqueNonNull(
      references.map((reference) => reference.orderDemandId),
    );
    if (productionOrderIds.length === 0 && orderDemandIds.length === 0)
      return new Map(
        references.map((reference) => [
          reference.referenceId,
          fallbackResolution(reference),
        ]),
      );

    const scope =
      productionOrderIds.length === 0
        ? inArray(laundryProduction.orderDemands.id, orderDemandIds)
        : orderDemandIds.length === 0
          ? inArray(laundryProduction.productionOrders.id, productionOrderIds)
          : or(
              inArray(
                laundryProduction.productionOrders.id,
                productionOrderIds,
              ),
              inArray(laundryProduction.orderDemands.id, orderDemandIds),
            );
    const rows = await db
      .select({
        productionOrderId: laundryProduction.productionOrders.id,
        orderDemandId: laundryProduction.orderDemands.id,
        canonicalOrderId: orders.orders.id,
        fulfillmentId: orders.orderFulfillments.id,
        displayNumber: orders.orders.displayNumber,
        customerResolution: orders.orders.customerResolution,
        customerUserId: orders.orders.customerUserId,
        firstName: users.users.firstName,
        lastName: users.users.lastName,
        businessName: users.users.businessName,
        phone: users.users.phone,
        commercialState: orders.orders.state,
        orderVersion: orders.orders.version,
        admissionState: orders.orderFulfillments.releaseState,
        fulfillmentVersion: orders.orderFulfillments.version,
      })
      .from(laundryProduction.orderDemands)
      .leftJoin(
        laundryProduction.productionOrders,
        eq(
          laundryProduction.productionOrders.orderDemandId,
          laundryProduction.orderDemands.id,
        ),
      )
      .innerJoin(
        orders.orderFulfillments,
        eq(
          orders.orderFulfillments.id,
          laundryProduction.orderDemands.fulfillmentId,
        ),
      )
      .innerJoin(
        orders.orders,
        eq(orders.orders.id, orders.orderFulfillments.orderId),
      )
      .leftJoin(users.users, eq(users.users.id, orders.orders.customerUserId))
      .where(scope);

    const byProductionOrderId = new Map(
      rows.flatMap((row) =>
        row.productionOrderId === null
          ? []
          : ([[row.productionOrderId, row]] as const),
      ),
    );
    const byOrderDemandId = new Map(
      rows.map((row) => [row.orderDemandId, row] as const),
    );

    return new Map(
      references.map((reference) => {
        const row =
          (reference.productionOrderId === null
            ? undefined
            : byProductionOrderId.get(reference.productionOrderId)) ??
          (reference.orderDemandId === null
            ? undefined
            : byOrderDemandId.get(reference.orderDemandId));
        if (row === undefined)
          return [
            reference.referenceId,
            fallbackResolution(reference),
          ] as const;

        const displayNumber = row.displayNumber?.trim() || null;
        const canonical: CanonicalOrderContext = {
          canonicalOrderId: row.canonicalOrderId,
          canonicalFulfillmentId: row.fulfillmentId,
          displayNumber: row.displayNumber,
          customer: {
            resolution: customerResolutionFromPersistence(
              row.customerResolution,
            ),
            userId: row.customerUserId,
            firstName: row.firstName,
            lastName: row.lastName,
            businessName: row.businessName,
            phone: row.phone,
          },
          commercialState: commercialStateFromPersistence(row.commercialState),
          admissionState: admissionStateFromPersistence(row.admissionState),
          versions: {
            order: row.orderVersion,
            fulfillment: row.fulfillmentVersion,
          },
        };
        return [
          reference.referenceId,
          {
            identity: {
              displayNumber: displayNumber ?? reference.fallbackDisplayNumber,
              customerDisplayName: canonicalCustomerDisplayName(row),
            },
            canonical,
          },
        ] as const;
      }),
    );
  },
});
