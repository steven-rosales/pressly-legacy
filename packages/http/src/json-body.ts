export type JsonBodyEncoding =
  | Readonly<{ tag: 'encoded'; body: string }>
  | Readonly<{
      tag: 'rejected';
      reason: 'unsupported_top_level_value' | 'serialization_failed';
      cause?: unknown;
    }>;

/** Pure trust-boundary encoding. Callers retain ownership of error semantics. */
export const encodeJsonBody = (value: unknown): JsonBodyEncoding => {
  try {
    const body = JSON.stringify(value);
    return body === undefined
      ? { tag: 'rejected', reason: 'unsupported_top_level_value' }
      : { tag: 'encoded', body };
  } catch (cause: unknown) {
    return { tag: 'rejected', reason: 'serialization_failed', cause };
  }
};
