import type { z } from 'zod';
import type {
  centsCanonicalCustomerInputSchema,
  centsCanonicalMarketingInputSchema,
  centsCanonicalOrderInputSchema,
  centsIngressDecisionSchema,
  centsIngressReceiptSchema,
  centsWebhookWireEnvelopeSchema,
} from './cents.contracts.ts';

export type CentsWebhookWireEnvelope = z.infer<
  typeof centsWebhookWireEnvelopeSchema
>;
export type CentsIngressReceipt = z.infer<typeof centsIngressReceiptSchema>;
export type CentsCanonicalOrderInput = z.infer<
  typeof centsCanonicalOrderInputSchema
>;
export type CentsCanonicalCustomerInput = z.infer<
  typeof centsCanonicalCustomerInputSchema
>;
export type CentsCanonicalMarketingInput = z.infer<
  typeof centsCanonicalMarketingInputSchema
>;
export type CentsIngressDecision = z.infer<typeof centsIngressDecisionSchema>;
