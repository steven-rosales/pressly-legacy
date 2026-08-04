export {
  changeProductionAdmissionRequestSchema,
  changeProductionAdmissionResultSchema,
  productionOrderParamsSchema,
} from '@pressly/contracts/production';
import type { ChangeProductionAdmissionResult as ChangeProductionAdmissionWireResult } from '@pressly/contracts/production';
import type { ChangeProductionAdmissionResult } from './change-production-admission.model.ts';

export const toChangeProductionAdmissionResult = (
  result: ChangeProductionAdmissionResult,
): ChangeProductionAdmissionWireResult => ({
  locationId: result.locationId,
  orderId: result.orderId,
  admissionOverride: result.admissionOverride,
  status: result.status,
  version: result.version,
  replayed: result.replayed,
});
