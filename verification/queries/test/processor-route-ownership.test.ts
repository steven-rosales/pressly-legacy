import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { processorBrowserOperations } from '@pressly/topology/browser-operations';
import {
  processorProjectionRoutes,
  productionQueryConformanceCatalog,
} from '../src/public.ts';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const absolute = (path: string): string => `${repositoryRoot}/${path}`;
const read = (path: string): Promise<string> =>
  readFile(absolute(path), 'utf8');
const normalized = (value: string): string =>
  value.replace(/['"]/g, '"').replace(/\s+/g, ' ');
const experienceSourcesByProductionOperation = new Map<
  string,
  Readonly<{ cell: string; contract: string; http: string }>
>([
  [
    'production.load-board.v1',
    {
      cell: 'experiences/processor/src/cells/production/load-production-board/cell.ts',
      contract:
        'experiences/processor/src/cells/production/load-production-board/contract.ts',
      http: 'experiences/processor/src/cells/production/load-production-board/http.ts',
    },
  ],
  [
    'production.preview-order-backlog.v1',
    {
      cell: 'experiences/processor/src/cells/production/preview-production-order-backlog/cell.ts',
      contract:
        'experiences/processor/src/cells/production/preview-production-order-backlog/contract.ts',
      http: 'experiences/processor/src/cells/production/preview-production-order-backlog/http.ts',
    },
  ],
  [
    'production.load-workspace.v1',
    {
      cell: 'experiences/processor/src/cells/production/load-production-workspace/cell.ts',
      contract:
        'experiences/processor/src/cells/production/load-production-workspace/contract.ts',
      http: 'experiences/processor/src/cells/production/load-production-workspace/http.ts',
    },
  ],
  [
    'production.load-remaining-day-forecast.v1',
    {
      cell: 'experiences/processor/src/cells/forecast/load-remaining-day-forecast/cell.ts',
      contract:
        'experiences/processor/src/cells/forecast/load-remaining-day-forecast/contract.ts',
      http: 'experiences/processor/src/cells/forecast/load-remaining-day-forecast/http.ts',
    },
  ],
  [
    'production.list-history-activity.v1',
    {
      cell: 'experiences/processor/src/cells/history/list-production-history-activity/cell.ts',
      contract:
        'experiences/processor/src/cells/history/list-production-history-activity/contract.ts',
      http: 'experiences/processor/src/cells/history/list-production-history-activity/http.ts',
    },
  ],
  [
    'production.load-history-run.v1',
    {
      cell: 'experiences/processor/src/cells/history/load-production-history-run/cell.ts',
      contract:
        'experiences/processor/src/cells/history/load-production-history-run/contract.ts',
      http: 'experiences/processor/src/cells/history/load-production-history-run/http.ts',
    },
  ],
  [
    'production.list-order-control.v1',
    {
      cell: 'experiences/processor/src/cells/orders/list-production-order-control/cell.ts',
      contract:
        'experiences/processor/src/cells/orders/list-production-order-control/contract.ts',
      http: 'experiences/processor/src/cells/orders/list-production-order-control/http.ts',
    },
  ],
]);
describe('Processor query route ownership after activation', () => {
  it('keeps exactly seven active routes in Processor Experience cells', async () => {
    expect(processorProjectionRoutes).toHaveLength(7);
    expect(experienceSourcesByProductionOperation.size).toBe(7);

    for (const route of processorProjectionRoutes) {
      const paths = experienceSourcesByProductionOperation.get(
        route.operationId,
      );
      expect(paths, route.operationId).toBeDefined();
      const [cell, contract, http] = await Promise.all([
        read(paths!.cell).then(normalized),
        read(paths!.contract).then(normalized),
        read(paths!.http).then(normalized),
      ]);
      expect(cell).toContain('CellDeclaration');
      expect(cell).toContain('surfaces: [surface]');
      expect(contract).toContain(normalized(`'${route.processorOperationId}'`));
      expect(contract).toContain(route.responseSchema);
      expect(http).toContain(`http.${route.route.method.toLowerCase()}<`);
      expect(http).toContain(normalized(`'${route.route.path}'`));
    }
  });

  it('publishes the same seven Processor operations through topology descriptors', () => {
    for (const { processorOperationId, route } of processorProjectionRoutes) {
      expect(Object.keys(processorBrowserOperations)).toContain(
        processorOperationId,
      );
      const descriptor = Object.values(processorBrowserOperations).find(
        (operation) => operation.operationId === processorOperationId,
      );
      expect(descriptor).toBeDefined();
      expect(JSON.stringify(descriptor)).toContain(route.method);
      expect(JSON.stringify(descriptor)).toContain(route.path);
    }
  });

  it('adapts the seven base Production query cells into one Processor server assembly', async () => {
    const composition = normalized(
      await read('experiences/processor/src/server/processor-server.ts'),
    );
    for (const cell of [
      'loadBoard',
      'previewOrderBacklog',
      'loadWorkspace',
      'loadRemainingDayForecast',
      'listHistoryActivity',
      'loadHistoryRun',
      'listOrderControl',
    ])
      expect(composition).toContain(`dependencies.production.${cell}`);
    expect(composition).toContain(
      'resolveOrderCanonical: dependencies.resolveOrderCanonical',
    );
    expect(composition).toContain(
      'loadOrderAudit: dependencies.loadOrderAudit',
    );
  });

  it('keeps fallback identity in Experience and composes canonical lookup from owner capabilities', async () => {
    const identity = normalized(
      await read('experiences/processor/src/server/model/operational-order.ts'),
    );
    for (const fragment of [
      'displayNumber: displayNumber ?? reference.fallbackDisplayNumber',
      'canonical === null ? null : canonicalCustomerDisplayName(canonical.customer)',
      'canonical,',
    ])
      expect(identity).toContain(normalized(fragment));

    const capabilities = normalized(
      await read(
        'experiences/processor/src/server/model/operational-order-capabilities.ts',
      ),
    );
    for (const fragment of [
      'dependencies.production.resolveFulfillmentReferencesV1.resolve(',
      'dependencies.orders.resolveCanonicalOrdersByFulfillmentV1.execute(',
      'dependencies.orders.listRecentOrderAuditV1.execute({',
      'dependencies.production.listRecentOrderActivityV1.list({',
    ])
      expect(capabilities).toContain(normalized(fragment));

    const composition = normalized(
      await read('topology/runtime/http/bootstrap/target-owners.ts'),
    );
    expect(composition).toContain(
      'makeProcessorOperationalOrderCapabilities({ production: production.capabilities, orders: orders.capabilities, })',
    );
  });

  it('records the seven base query leaves as Processor Experience selections', () => {
    const selected = productionQueryConformanceCatalog.filter(
      ({ selectedHttpOwner }) => selectedHttpOwner === 'processor-experience',
    );
    expect(selected).toHaveLength(7);

    expect(
      selected.every(({ operationId }) =>
        experienceSourcesByProductionOperation.has(operationId),
      ),
    ).toBe(true);
  });
});
