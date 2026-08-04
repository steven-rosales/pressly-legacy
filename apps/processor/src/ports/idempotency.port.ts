import type { JsonValue } from '@pressly/codec';

export type IdempotencyPort = Readonly<{
  key: (input: { operation: string; payload: JsonValue }) => Promise<string>;
}>;
