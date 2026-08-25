import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  processorProjectionRoutes,
  productionQueryConformanceCatalog,
  queryConformanceCapabilities,
} from '../src/public.ts';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const absolute = (path: string): string => `${repositoryRoot}/${path}`;
const normalized = (value: string): string =>
  value.replace(/['"]/g, '"').replace(/\s+/g, ' ');

describe('Production query conformance catalog', () => {
  it('covers the complete assigned read batch with one canonical operation id', () => {
    expect(
      productionQueryConformanceCatalog.map(({ operationId }) => operationId),
    ).toEqual([
      'production.preview-order-backlog.v1',
      'production.list-history-activity.v1',
      'production.list-history-plans.v1',
      'production.list-history-runs.v1',
      'production.load-history-run.v1',
      'production.list-order-control.v1',
      'production.list-orders.v1',
      'production.preview-order-route.v1',
      'production.load-board.v1',
      'production.load-remaining-day-forecast.v1',
      'production.load-workspace.v1',
      'production.list-locations.v1',
    ]);
    expect(
      new Set(
        productionQueryConformanceCatalog.map(({ operationId }) => operationId),
      ).size,
    ).toBe(productionQueryConformanceCatalog.length);
  });

  it('selects exactly the seven Processor experience routes and keeps their system capabilities headless', () => {
    const processorOwned = productionQueryConformanceCatalog.filter(
      ({ selectedHttpOwner }) => selectedHttpOwner === 'processor-experience',
    );
    expect(processorOwned).toHaveLength(7);
    expect(
      processorOwned.every(({ systemSurface }) => systemSurface === 'headless'),
    ).toBe(true);
    expect(
      processorProjectionRoutes.map(({ operationId }) => operationId).sort(),
    ).toEqual(processorOwned.map(({ operationId }) => operationId).sort());
    expect(
      new Set(
        processorProjectionRoutes.map(
          ({ route }) => `${route.method} ${route.path}`,
        ),
      ).size,
    ).toBe(7);
  });

  it('keeps every non-shadow query on one Production HTTP surface', () => {
    const systemOwned = productionQueryConformanceCatalog.filter(
      ({ selectedHttpOwner }) => selectedHttpOwner === 'production-system',
    );
    expect(systemOwned).toHaveLength(5);
    expect(
      systemOwned.every(({ systemSurface }) => systemSurface === 'http'),
    ).toBe(true);
    expect(
      new Set(
        productionQueryConformanceCatalog.map(
          ({ route }) => `${route.method} ${route.path}`,
        ),
      ).size,
    ).toBe(productionQueryConformanceCatalog.length);
  });

  it('names every unresolved shared capability instead of hiding it behind a generic repository', () => {
    const used = new Set(
      productionQueryConformanceCatalog.flatMap(
        ({ requiredCapabilities }) => requiredCapabilities,
      ),
    );
    expect([...used].sort()).toEqual(
      Object.keys(queryConformanceCapabilities).sort(),
    );
    expect(
      Object.values(queryConformanceCapabilities).every(
        (description) => description.length >= 80,
      ),
    ).toBe(true);
  });

  it('pins source semantics and points every row at executable evidence', async () => {
    for (const query of productionQueryConformanceCatalog) {
      const boundary = await readFile(absolute(query.boundarySource), 'utf8');
      for (const schema of [...query.requestSchemas, query.resultSchema])
        expect(
          boundary,
          `${query.operationId}: ${query.boundarySource}`,
        ).toContain(schema);

      const evidence = [
        ...query.evidence.contractTests,
        ...query.evidence.behaviorTests,
        ...query.evidence.postgresTests,
      ];
      expect(evidence.length, query.operationId).toBeGreaterThan(1);
      await Promise.all(evidence.map((path) => access(absolute(path))));

      for (const anchor of query.sourceAnchors) {
        const source = normalized(
          await readFile(absolute(anchor.file), 'utf8'),
        );
        for (const fragment of anchor.contains)
          expect(source, `${query.operationId}: ${anchor.file}`).toContain(
            normalized(fragment),
          );
      }
    }
  });
});
