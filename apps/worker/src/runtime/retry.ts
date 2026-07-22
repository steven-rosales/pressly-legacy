export const retryDelayMs = (input: {
  attempt: number;
  baseMs: number;
  maxMs: number;
  jitter: number;
}): number => {
  const exponential = Math.min(
    input.maxMs,
    input.baseMs * 2 ** Math.max(0, input.attempt - 1),
  );
  return Math.round(exponential * (0.75 + input.jitter * 0.5));
};
