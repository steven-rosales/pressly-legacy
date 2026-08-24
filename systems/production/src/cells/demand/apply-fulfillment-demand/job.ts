import { job } from '@pressly/cells';
import type { ApplyFulfillmentDemandExpectedFailure } from './types.ts';

export const applyFulfillmentDemandJobSurface = job.message({
  id: 'production.apply-fulfillment-demand-job.v2',
  queue: 'order_outbox',
  toSerializedInput: (mappedCommand) => mappedCommand,
  presentFailure: (failure: ApplyFulfillmentDemandExpectedFailure) => ({
    code: failure.code,
    message: failure.safeMessage,
    retryable: false,
    category: failure.kind,
    status:
      failure.kind === 'validation'
        ? failure.classification === 'semantic'
          ? 422
          : 400
        : failure.kind === 'not_found'
          ? 404
          : 409,
  }),
});
