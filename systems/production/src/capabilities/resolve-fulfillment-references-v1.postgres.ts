import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq, inArray, or } from '@pressly/postgres/query';

import {
  resolveProductionFulfillmentReferencesV1CapabilityContract,
  type ResolveProductionFulfillmentReferencesV1Capability,
} from '../contracts/resolve-fulfillment-references-v1.ts';
import type { ProductionSchema } from '../schema/production-schema.ts';

const uniqueNonNull = (values: readonly (string | null)[]): string[] => [
  ...new Set(values.filter((value): value is string => value !== null)),
];

export const makeResolveProductionFulfillmentReferencesV1Capability = (
  input: Readonly<{
    database: PostgresDatabase;
    schema: ProductionSchema;
  }>,
): ResolveProductionFulfillmentReferencesV1Capability =>
  Object.freeze({
    contract: resolveProductionFulfillmentReferencesV1CapabilityContract,
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
          references.map((reference) => [reference.referenceId, null]),
        );

      const scope =
        productionOrderIds.length === 0
          ? inArray(input.schema.orderDemands.id, orderDemandIds)
          : orderDemandIds.length === 0
            ? inArray(input.schema.productionOrders.id, productionOrderIds)
            : or(
                inArray(input.schema.productionOrders.id, productionOrderIds),
                inArray(input.schema.orderDemands.id, orderDemandIds),
              );
      const rows = await input.database
        .select({
          productionOrderId: input.schema.productionOrders.id,
          orderDemandId: input.schema.orderDemands.id,
          fulfillmentId: input.schema.orderDemands.fulfillmentId,
        })
        .from(input.schema.orderDemands)
        .leftJoin(
          input.schema.productionOrders,
          eq(
            input.schema.productionOrders.orderDemandId,
            input.schema.orderDemands.id,
          ),
        )
        .where(scope);

      const byProductionOrderId = new Map(
        rows.flatMap((row) =>
          row.productionOrderId === null
            ? []
            : ([[row.productionOrderId, row.fulfillmentId]] as const),
        ),
      );
      const byOrderDemandId = new Map(
        rows.map((row) => [row.orderDemandId, row.fulfillmentId] as const),
      );

      return new Map(
        references.map((reference) => {
          const fulfillmentId =
            (reference.productionOrderId === null
              ? undefined
              : byProductionOrderId.get(reference.productionOrderId)) ??
            (reference.orderDemandId === null
              ? undefined
              : byOrderDemandId.get(reference.orderDemandId));
          return [
            reference.referenceId,
            fulfillmentId === undefined ? null : { fulfillmentId },
          ] as const;
        }),
      );
    },
  });
