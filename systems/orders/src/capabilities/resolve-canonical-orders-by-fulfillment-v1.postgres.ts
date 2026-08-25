import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq, inArray } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  resolveCanonicalOrdersByFulfillmentV1CapabilityContract,
  type CanonicalOrderByFulfillmentV1,
  type ResolveCanonicalOrdersByFulfillmentV1Capability,
} from '../contracts/resolve-canonical-orders-by-fulfillment-v1.ts';
import type { OrdersSchema } from '../schema/orders.ts';

const unexpectedPersistenceValue = (field: string, value: string): never => {
  throw invariantViolationError({
    code: 'orders_canonical_fulfillment_read_invalid_persistence_value',
    message: `Unexpected ${field} value in canonical Order projection: ${value}.`,
    safeMessage: 'Stored order data is inconsistent.',
  });
};

const customerResolution = (
  value: string,
): CanonicalOrderByFulfillmentV1['customer']['resolution'] => {
  switch (value) {
    case 'resolved':
    case 'not_provided':
    case 'pending':
    case 'conflict':
      return value;
    default:
      return unexpectedPersistenceValue('customer resolution', value);
  }
};

const commercialState = (
  value: string,
): CanonicalOrderByFulfillmentV1['commercialState'] => {
  switch (value) {
    case 'open':
    case 'completed':
    case 'canceled':
      return value;
    default:
      return unexpectedPersistenceValue('commercial state', value);
  }
};

const admissionState = (
  value: string,
): CanonicalOrderByFulfillmentV1['admissionState'] => {
  switch (value) {
    case 'unreleased':
    case 'released':
    case 'withdrawn':
      return value;
    default:
      return unexpectedPersistenceValue('admission state', value);
  }
};

export const makeResolveCanonicalOrdersByFulfillmentV1Capability = (input: {
  db: PostgresDatabase;
  schema: Pick<OrdersSchema, 'orderFulfillments' | 'orders'>;
}): ResolveCanonicalOrdersByFulfillmentV1Capability =>
  Object.freeze({
    contract: resolveCanonicalOrdersByFulfillmentV1CapabilityContract,
    execute: async (references) => {
      if (references.length === 0) return new Map();
      const fulfillmentIds = [
        ...new Set(references.map((reference) => reference.fulfillmentId)),
      ];
      const rows = await input.db.transaction(async (transaction) => {
        const ordersSchema = input.schema;
        return transaction
          .select({
            canonicalOrderId: ordersSchema.orders.id,
            fulfillmentId: ordersSchema.orderFulfillments.id,
            displayNumber: ordersSchema.orders.displayNumber,
            customerResolution: ordersSchema.orders.customerResolution,
            customerId: ordersSchema.orders.customerId,
            firstName: ordersSchema.orders.customerFirstName,
            lastName: ordersSchema.orders.customerLastName,
            businessName: ordersSchema.orders.customerBusinessName,
            phone: ordersSchema.orders.customerPhone,
            commercialState: ordersSchema.orders.state,
            orderVersion: ordersSchema.orders.version,
            admissionState: ordersSchema.orderFulfillments.releaseState,
            fulfillmentVersion: ordersSchema.orderFulfillments.version,
          })
          .from(ordersSchema.orderFulfillments)
          .innerJoin(
            ordersSchema.orders,
            eq(ordersSchema.orders.id, ordersSchema.orderFulfillments.orderId),
          )
          .where(inArray(ordersSchema.orderFulfillments.id, fulfillmentIds));
      });
      const byFulfillmentId = new Map(
        rows.map((row) => [row.fulfillmentId, row] as const),
      );

      return new Map(
        references.map((reference) => {
          const row = byFulfillmentId.get(reference.fulfillmentId);
          if (row === undefined) return [reference.referenceId, null] as const;
          return [
            reference.referenceId,
            {
              canonicalOrderId: row.canonicalOrderId,
              canonicalFulfillmentId: row.fulfillmentId,
              displayNumber: row.displayNumber,
              customer: {
                resolution: customerResolution(row.customerResolution),
                userId: row.customerId,
                firstName: row.firstName,
                lastName: row.lastName,
                businessName: row.businessName,
                phone: row.phone,
              },
              commercialState: commercialState(row.commercialState),
              admissionState: admissionState(row.admissionState),
              versions: {
                order: row.orderVersion,
                fulfillment: row.fulfillmentVersion,
              },
            } satisfies CanonicalOrderByFulfillmentV1,
          ] as const;
        }),
      );
    },
  });
