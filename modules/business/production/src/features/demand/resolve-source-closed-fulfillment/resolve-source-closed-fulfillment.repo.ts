import type { Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ProductionOrderResolutionCandidate } from './resolve-source-closed-fulfillment.model.ts';
import type { ResolveSourceClosedFulfillmentRepository } from './resolve-source-closed-fulfillment.port.ts';

const invalidCandidateState = (field: string, value: string) =>
  invariantViolationError({
    code: 'source_closed_fulfillment_candidate_invalid',
    message: `Unknown ${field}: ${value}.`,
    safeMessage: 'Production state is inconsistent.',
  });

const admissionState = (
  value: string,
): ProductionOrderResolutionCandidate['sourceAdmissionState'] => {
  switch (value) {
    case 'unreleased':
    case 'released':
    case 'withdrawn':
      return value;
    default:
      throw invalidCandidateState('fulfillment admission state', value);
  }
};

const commercialState = (
  value: string,
): ProductionOrderResolutionCandidate['sourceCommercialState'] => {
  switch (value) {
    case 'open':
    case 'completed':
    case 'canceled':
      return value;
    default:
      throw invalidCandidateState('order commercial state', value);
  }
};

export const makeResolveSourceClosedFulfillmentRepository = (
  db: Database,
): ResolveSourceClosedFulfillmentRepository => ({
  findCandidate: async (locationId, fulfillmentId) => {
    const [row] = await db
      .select({
        orderId: laundryProduction.productionOrders.id,
        locationId: laundryProduction.productionOrders.locationId,
        productionVersion: laundryProduction.productionOrders.version,
        resolutionState: laundryProduction.productionOrders.resolutionState,
        sourceAdmissionState: laundryProduction.orderDemands.admissionState,
        sourceCommercialState: laundryProduction.orderDemands.commercialState,
      })
      .from(laundryProduction.orderDemands)
      .innerJoin(
        laundryProduction.productionOrders,
        and(
          eq(
            laundryProduction.productionOrders.orderDemandId,
            laundryProduction.orderDemands.id,
          ),
          eq(
            laundryProduction.productionOrders.locationId,
            laundryProduction.orderDemands.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(laundryProduction.orderDemands.locationId, locationId),
          eq(laundryProduction.orderDemands.fulfillmentId, fulfillmentId),
        ),
      )
      .limit(1);

    return row === undefined
      ? null
      : {
          orderId: row.orderId,
          locationId: row.locationId,
          productionVersion: row.productionVersion,
          resolutionState: row.resolutionState,
          sourceAdmissionState: admissionState(row.sourceAdmissionState),
          sourceCommercialState: commercialState(row.sourceCommercialState),
        };
  },
});
