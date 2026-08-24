import { createHash } from 'node:crypto';
import type { BoundaryContract } from '@pressly/cells';
import { expect } from 'vitest';
import { z } from 'zod';

export type ContractModule = Readonly<Record<string, unknown>>;

export type WireFixture = Readonly<{
  name: string;
  serialized: unknown;
}>;

export const observedWireBehaviorDigests = new Map<string, string>();

const normalizeDescriptor = (value: unknown, key?: string): unknown => {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeDescriptor(item));
    return key === 'required' ? [...normalized].sort() : normalized;
  }
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([entryKey, entryValue]) => [
        entryKey,
        normalizeDescriptor(entryValue, entryKey),
      ]),
  );
};

export const jsonSchemaDescriptor = (schema: z.ZodType): unknown =>
  normalizeDescriptor(z.toJSONSchema(schema, { unrepresentable: 'any' }));

export const schemaEntries = (
  module: ContractModule,
): readonly (readonly [string, z.ZodType])[] =>
  Object.entries(module).filter(
    (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
  );

export const expectZodWireParity = (
  label: string,
  owner: z.ZodType,
  fixtures: readonly WireFixture[],
): void => {
  observedWireBehaviorDigests.set(
    label,
    createHash('sha256')
      .update(
        JSON.stringify(
          fixtures.map((fixture) => {
            const result = owner.safeParse(fixture.serialized);
            return result.success
              ? { name: fixture.name, valid: true, value: result.data }
              : { name: fixture.name, valid: false };
          }),
        ),
      )
      .digest('hex'),
  );
  for (const fixture of fixtures) {
    const ownerResult = owner.safeParse(fixture.serialized);
    expect.soft(ownerResult, `${label}: ${fixture.name}`).toBeDefined();
  }
};

export const expectBoundaryWireParity = <Value>(
  label: string,
  owner: BoundaryContract<Value>,
  fixtures: readonly WireFixture[],
): void => {
  observedWireBehaviorDigests.set(
    label,
    createHash('sha256')
      .update(
        JSON.stringify(
          fixtures.map((fixture) => {
            const result = owner.decode(fixture.serialized);
            return result.kind === 'valid'
              ? {
                  name: fixture.name,
                  valid: true,
                  value: owner.encode(result.value),
                }
              : { name: fixture.name, valid: false };
          }),
        ),
      )
      .digest('hex'),
  );
  for (const fixture of fixtures) {
    const ownerResult = owner.decode(fixture.serialized);
    expect.soft(ownerResult, `${label}: ${fixture.name}`).toBeDefined();
  }
};
