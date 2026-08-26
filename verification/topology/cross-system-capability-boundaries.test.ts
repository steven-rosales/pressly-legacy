import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const ordersSourceRoot = path.join(repositoryRoot, 'systems/orders/src');
const sourceMap = JSON.parse(
  readFileSync(
    path.join(repositoryRoot, 'tooling/typescript/dependency-cruiser.json'),
    'utf8',
  ),
) as Readonly<{
  compilerOptions: Readonly<{
    paths: Readonly<Record<string, readonly string[]>>;
  }>;
}>;

const customerResolution =
  '@pressly/customers-system/capabilities/resolve-exact-source-customer-v1';
const customerReference =
  '@pressly/customers-system/capabilities/customer-reference-v1';

const productionSources = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(target);
    if (
      !/[.]tsx?$/u.test(entry.name) ||
      /[.](?:spec|test)[.]tsx?$/u.test(entry.name)
    )
      return [];
    return [target];
  });

const peerCapabilityImport =
  /from\s+['"](@pressly\/(?:access|customers)-system\/capabilities\/[^'"]+)['"]/gu;

const capabilityConsumers = new Map<string, string[]>();
for (const file of productionSources(ordersSourceRoot)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(peerCapabilityImport)) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    const consumers = capabilityConsumers.get(specifier) ?? [];
    consumers.push(
      path.relative(repositoryRoot, file).replaceAll(path.sep, '/'),
    );
    capabilityConsumers.set(specifier, consumers);
  }
}

const capabilitySource = (specifier: string): string => {
  const targets = sourceMap.compilerOptions.paths[specifier];
  expect(targets, `source mapping for ${specifier}`).toHaveLength(1);
  const target = targets?.[0];
  expect(target, `source target for ${specifier}`).toBeDefined();
  return readFileSync(path.join(repositoryRoot, target ?? ''), 'utf8');
};

describe('Orders cross-System capability boundaries', () => {
  it('keeps every separable collaboration contract free of database mechanisms', () => {
    expect([...capabilityConsumers.keys()].sort()).toEqual([
      '@pressly/access-system/capabilities/order-location-facts-v1',
      customerReference,
      customerResolution,
    ]);

    for (const specifier of capabilityConsumers.keys()) {
      const source = capabilitySource(specifier);
      expect(source).not.toMatch(/@pressly\/postgres|drizzle-orm/u);
      expect(source).not.toMatch(
        /\b(?:PostgresDatabase|PostgresExecutor|PostgresTransaction|SQL|SQLWrapper)\b/u,
      );
      expect(source).not.toMatch(
        /\b(?:executeInTransaction|planForTransaction|readInTransaction)\b|caller-owned/u,
      );
      expect(source).not.toMatch(/from\s+['"][^'"]*\/schema(?:\/|[.'"])/u);
    }
  });

  it('uses only owner-owned data capabilities for Customer collaboration', () => {
    for (const specifier of [customerReference, customerResolution]) {
      expect(capabilitySource(specifier)).toContain("execution: 'owner-owned'");
    }
    expect(
      productionSources(ordersSourceRoot)
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n'),
    ).not.toMatch(/customerExistsV1|canonicalOrderCustomerReadV1/u);
  });
});
