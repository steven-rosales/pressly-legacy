import type {
  ProcessorOperationalOrderIdentity,
  ProcessorOrderContext,
} from '@pressly/contracts';
import {
  eq,
  inArray,
  laundryProduction,
  or,
  orders,
  users,
  type Database,
} from '@pressly/db';

export type ProcessorOperationalOrderIdentityReference = Readonly<{
  referenceId: string;
  productionOrderId: string | null;
  orderDemandId: string | null;
  fallbackDisplayNumber: string;
}>;

type ProcessorCanonicalOrderContext = Omit<ProcessorOrderContext, 'source'>;

export type ProcessorOperationalOrderIdentityResolution = Readonly<{
  identity: ProcessorOperationalOrderIdentity;
  canonical: ProcessorCanonicalOrderContext | null;
}>;

export type ProcessorOperationalOrderIdentityResolver = Readonly<{
  resolve: (
    references: readonly ProcessorOperationalOrderIdentityReference[],
  ) => Promise<
    ReadonlyMap<string, ProcessorOperationalOrderIdentityResolution>
  >;
}>;

const cleanNamePart = (value: string | null): string | null => {
  const normalized = value?.trim().replace(/\s+/g, ' ') ?? '';
  return normalized.length === 0 ? null : normalized;
};

export const canonicalCustomerDisplayName = (input: {
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string | null => {
  const businessName = cleanNamePart(input.businessName);
  if (businessName !== null) return businessName;
  const personalName = [input.firstName, input.lastName]
    .map(cleanNamePart)
    .filter((part): part is string => part !== null)
    .join(' ');
  return personalName.length === 0 ? null : personalName;
};

const unique = (values: readonly (string | null)[]): string[] => [
  ...new Set(values.filter((value): value is string => value !== null)),
];

export const makeProcessorOperationalOrderIdentityResolver = (
  db: Database,
): ProcessorOperationalOrderIdentityResolver => ({
  resolve: async (references) => {
    if (references.length === 0) return new Map();

    const productionOrderIds = unique(
      references.map((reference) => reference.productionOrderId),
    );
    const orderDemandIds = unique(
      references.map((reference) => reference.orderDemandId),
    );
    if (productionOrderIds.length === 0 && orderDemandIds.length === 0)
      return new Map<string, ProcessorOperationalOrderIdentityResolution>(
        references.map((reference) => [
          reference.referenceId,
          {
            identity: {
              displayNumber: reference.fallbackDisplayNumber,
              customerDisplayName: null,
            },
            canonical: null,
          },
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
        admissionState: orders.orderFulfillments.releaseState,
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

    const entries: [string, ProcessorOperationalOrderIdentityResolution][] =
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
            {
              identity: {
                displayNumber: reference.fallbackDisplayNumber,
                customerDisplayName: null,
              },
              canonical: null,
            },
          ] as const;

        const displayNumber =
          cleanNamePart(row.displayNumber) ?? reference.fallbackDisplayNumber;
        const canonical: ProcessorCanonicalOrderContext = {
          canonicalOrderId: row.canonicalOrderId,
          canonicalFulfillmentId: row.fulfillmentId,
          displayNumber: row.displayNumber,
          customer: {
            resolution:
              row.customerResolution as ProcessorOrderContext['customer']['resolution'],
            userId: row.customerUserId,
            firstName: row.firstName,
            lastName: row.lastName,
            businessName: row.businessName,
            phone: row.phone,
          },
          commercialState:
            row.commercialState as ProcessorOrderContext['commercialState'],
          admissionState:
            row.admissionState as ProcessorOrderContext['admissionState'],
        };
        return [
          reference.referenceId,
          {
            identity: {
              displayNumber,
              customerDisplayName: canonicalCustomerDisplayName(row),
            },
            canonical,
          },
        ] as const;
      });
    return new Map(entries);
  },
});
