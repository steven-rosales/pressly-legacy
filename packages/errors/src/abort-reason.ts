export const abortReasonNames = ['AbortError', 'TimeoutError'] as const;

export type AbortReasonName = (typeof abortReasonNames)[number];

export type MakeAbortReasonInput = Readonly<{
  name: AbortReasonName;
  message: string;
}>;

/**
 * Owns native DOMException construction while preserving the platform reason
 * shape expected by AbortController, Fetch, and browser cancellation APIs.
 */
export const makeAbortReason = (input: MakeAbortReasonInput): DOMException =>
  new DOMException(input.message, input.name);
