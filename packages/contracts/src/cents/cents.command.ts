import type { z } from 'zod';
import type {
  centsIngressDecisionSchema,
  centsIngressReceiptSchema,
  centsOrderTerminalClosePayloadSchema,
  centsSubmittedOrderCandidatePayloadSchema,
  centsWebhookWireEnvelopeSchema,
} from './cents.contracts.ts';

export type CentsWebhookWireEnvelope = z.infer<
  typeof centsWebhookWireEnvelopeSchema
>;
export type CentsIngressReceipt = z.infer<typeof centsIngressReceiptSchema>;
export type CentsSubmittedOrderCandidatePayload = z.infer<
  typeof centsSubmittedOrderCandidatePayloadSchema
>;
export type CentsOrderTerminalClosePayload = z.infer<
  typeof centsOrderTerminalClosePayloadSchema
>;
export type CentsIngressDecision = z.infer<typeof centsIngressDecisionSchema>;
