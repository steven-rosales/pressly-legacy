import { job } from '@pressly/cells';
import type { ProcessInboundEventExpectedFailure } from './types.ts';

export const processInboundEventJobSurface = job.message({
  id: 'ingress.process-inbound-event-job.v1',
  queue: 'webhook_ingestion',
  toSerializedInput: (payload) => payload,
  presentFailure: (failure: ProcessInboundEventExpectedFailure) => ({
    code: failure.code,
    message: failure.safeMessage,
    retryable: failure.retryable,
    ...(failure.kind === 'validation'
      ? { category: 'validation' as const }
      : { category: 'external_service' as const }),
    status: failure.status,
  }),
});
