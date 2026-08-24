import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { productionCommandInventory } from '../src/public.ts';

describe('Production command conformance inventory', () => {
  it('anchors fourteen independently observable operations to fourteen surviving cells', () => {
    expect(productionCommandInventory).toHaveLength(14);
    expect(
      new Set(productionCommandInventory.map((entry) => entry.cellPath)).size,
    ).toBe(14);
    for (const entry of productionCommandInventory)
      expect(
        existsSync(new URL(`../../../${entry.cellPath}/`, import.meta.url)),
        entry.cellPath,
      ).toBe(true);
  });

  it('keeps operation identifiers and HTTP method-path pairs unique', () => {
    const ids = productionCommandInventory.map((entry) => entry.operationId);
    const routes = productionCommandInventory.flatMap((entry) =>
      entry.http === null ? [] : [`${entry.http.method} ${entry.http.path}`],
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('keeps projection ingestion and route preview out of the command kind', () => {
    expect(
      productionCommandInventory
        .filter((entry) => entry.cellKind !== 'command')
        .map((entry) => [entry.operationId, entry.cellKind]),
    ).toEqual([
      ['production.apply-fulfillment-demand.v1', 'reaction'],
      ['production.preview-order-route.v1', 'query'],
    ]);
  });

  it('requires complete command observations for every idempotent write', () => {
    const writes = productionCommandInventory.filter(
      (entry) => entry.idempotency.required,
    );

    for (const entry of writes) {
      expect(entry.repositoryCapabilities.length).toBeGreaterThan(0);
      expect(entry.policyCapabilities.length).toBeGreaterThan(0);
      expect(entry.scenarios).toEqual(
        expect.arrayContaining([
          'success',
          'expected_rejection',
          'unexpected_rollback',
          'replay',
          'idempotency_conflict',
        ]),
      );
    }
  });

  it('characterizes headless boundaries without inventing HTTP routes', () => {
    const headless = productionCommandInventory.filter(
      (entry) => entry.runtime !== 'http',
    );

    expect(headless.map((entry) => entry.operationId)).toEqual([
      'production.apply-fulfillment-demand.v1',
      'production.resolve-source-closed-fulfillment.v1',
      'production.manage-resources.v1',
    ]);
    expect(headless.every((entry) => entry.http === null)).toBe(true);
  });
});
