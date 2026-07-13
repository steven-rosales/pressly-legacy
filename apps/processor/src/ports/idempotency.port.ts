export type IdempotencyPort = Readonly<{
  key: (input: { operation: string; payload: unknown }) => Promise<string>
}>
