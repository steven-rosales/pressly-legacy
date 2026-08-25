import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ProductionOrderResolutionCandidate,
  ResolveSourceClosedFulfillmentRepository,
} from './types.ts';

const invalidCandidateState = (field: string, value: string) =>
  invariantViolationError({
    code: 'source_closed_fulfillment_candidate_invalid',
    message: `Unknown ${field}: ${value}.`,
    safeMessage: 'Production state is inconsistent.',
  });

const admissionState = (
  value: string,
): ProductionOrderResolutionCandidate['sourceAdmissionState'] => {
  if (value === 'unreleased' || value === 'released' || value === 'withdrawn')
    return value;
  throw invalidCandidateState('fulfillment admission state', value);
};

const commercialState = (
  value: string,
): ProductionOrderResolutionCandidate['sourceCommercialState'] => {
  if (value === 'open' || value === 'completed' || value === 'canceled')
    return value;
  throw invalidCandidateState('order commercial state', value);
};

export const makeResolveSourceClosedFulfillmentPostgresRepository = (
  deps: {
    db: PostgresDatabase;
  },
  schema: ProductionSchema,
): ResolveSourceClosedFulfillmentRepository =>
  Object.freeze({
    findCandidate: async (locationId, fulfillmentId) => {
      const [row] = await deps.db
        .select({
          productionOrderId: schema.productionOrders.id,
          locationId: schema.productionOrders.locationId,
          productionVersion: schema.productionOrders.version,
          resolutionState: schema.productionOrders.resolutionState,
          sourceAdmissionState: schema.orderDemands.admissionState,
          sourceCommercialState: schema.orderDemands.commercialState,
        })
        .from(schema.orderDemands)
        .innerJoin(
          schema.productionOrders,
          and(
            eq(schema.productionOrders.orderDemandId, schema.orderDemands.id),
            eq(
              schema.productionOrders.locationId,
              schema.orderDemands.locationId,
            ),
          ),
        )
        .where(
          and(
            eq(schema.orderDemands.locationId, locationId),
            eq(schema.orderDemands.fulfillmentId, fulfillmentId),
          ),
        )
        .limit(1);
      return row === undefined
        ? null
        : {
            productionOrderId: row.productionOrderId,
            locationId: row.locationId,
            productionVersion: row.productionVersion,
            resolutionState: row.resolutionState,
            sourceAdmissionState: admissionState(row.sourceAdmissionState),
            sourceCommercialState: commercialState(row.sourceCommercialState),
          };
    },
  });
