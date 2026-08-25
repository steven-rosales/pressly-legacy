import type { BoundaryContract } from '@pressly/cells';
import { expect } from 'vitest';

type DecodableBoundary = Readonly<{
  decode: (serialized: unknown) => Readonly<{ kind: string }>;
}>;

export const expectExactIngressInput = (
  contract: Readonly<{ input: DecodableBoundary }>,
  serialized: Readonly<Record<string, unknown>>,
): void => {
  expect(contract.input.decode(serialized).kind).toBe('valid');
  expect(contract.input.decode({ ...serialized, undeclared: true }).kind).toBe(
    'invalid',
  );
};

export const expectIngressRoundTrip = <Value>(
  boundary: BoundaryContract<Value>,
  value: NoInfer<Value>,
): void => {
  expect(boundary.decode(boundary.encode(value))).toMatchObject({
    kind: 'valid',
    value,
  });
};
