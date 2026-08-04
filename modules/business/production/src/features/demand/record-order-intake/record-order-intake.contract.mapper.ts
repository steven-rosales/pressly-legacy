export {
  productionOrderParamsSchema,
  recordOrderIntakeRequestSchema,
  recordOrderIntakeResultSchema,
} from '@pressly/contracts/production';
import type { RecordOrderIntakeResult as RecordOrderIntakeWireResult } from '@pressly/contracts/production';
import type { RecordOrderIntakeResult } from './record-order-intake.model.ts';

export const toRecordOrderIntakeResult = (
  result: RecordOrderIntakeResult,
): RecordOrderIntakeWireResult => ({
  locationId: result.locationId,
  orderId: result.orderId,
  bagCount: result.bagCount,
  bagCountProvenance: result.bagCountProvenance,
  intakeVersion: result.intakeVersion,
  version: result.version,
  replayed: result.replayed,
});
