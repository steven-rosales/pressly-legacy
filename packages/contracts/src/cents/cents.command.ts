import type { z } from 'zod';
import type {
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
export type CentsIngressDecision = z.infer<typeof centsIngressDecisionSchema>;
