import { describe, expect, it } from 'vitest';

import {
  controlBrowserOperations,
  customerBrowserOperations,
  processorBrowserOperations,
} from '../../topology/browser-operations.ts';
import { httpRouteManifest } from '../../topology/http.ts';
import { presslyObservabilityCatalog } from '../../topology/observability.ts';
import { presslyTopology } from '../../topology/pressly.topology.ts';

const selectedManifests = [
  ...presslyTopology.systems,
  ...presslyTopology.experiences,
].flatMap((owner) => owner.cells);

const browserOperations = [
  ...Object.values(controlBrowserOperations),
  ...Object.values(customerBrowserOperations),
  ...Object.values(processorBrowserOperations),
];

describe('handwritten topology', () => {
  it('has one owner and one declaration for every selected operation', () => {
    const ownerIds = [
      ...presslyTopology.systems.map((owner) => `system:${owner.id}`),
      ...presslyTopology.experiences.map((owner) => `experience:${owner.id}`),
    ];
    const operationIds = selectedManifests.map((manifest) => manifest.id);

    expect(new Set(ownerIds).size).toBe(ownerIds.length);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it('keeps route identity unique and tied to a selected operation', () => {
    const operationIds = new Set(
      selectedManifests.map((manifest) => manifest.id),
    );
    const routeKeys = httpRouteManifest.map(
      (route) => `${route.method} ${route.path}`,
    );

    expect(new Set(routeKeys).size).toBe(routeKeys.length);
    for (const route of httpRouteManifest)
      expect(operationIds.has(route.operationId)).toBe(true);
  });

  it('keeps browser transport descriptors unique and explicit', () => {
    const operationIds = browserOperations.map(
      (operation) => operation.operationId,
    );

    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(
      browserOperations.every((operation) => operation.contract !== undefined),
    ).toBe(true);
  });

  it('exposes a finite observability catalog from the same topology', () => {
    expect(
      Object.keys(presslyObservabilityCatalog.metrics).length,
    ).toBeGreaterThan(0);
    expect(
      presslyObservabilityCatalog.operationIdFor('production.advance_stage'),
    ).toBe('production.advance-stage.v1');
    expect(
      presslyObservabilityCatalog.operationIdForJobLabel('order_outbox'),
    ).toBe('production.apply-fulfillment-demand.v1');
  });
});
