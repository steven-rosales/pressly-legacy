import { describe, expect, it, vi } from 'vitest';
import { processorBrowserOperations } from '@pressly/topology/browser-operations';
import { processorBrowserOperationBindings } from '@pressly/topology/browser';
import { makeProcessorRuntimeFixture as makeProcessorRuntime } from '../support/processor-runtime.fixture.ts';
import { browserStorageFixture } from '../support/browser-storage.fixture.ts';
import compositionSourceText from '../../../../../topology/runtime/browser/processor.ts?raw';

const compositionSource = compositionSourceText.replace(/\s+/g, ' ');

describe('Processor query-client composition', () => {
  it('binds explicit authentication and only the four browser-consumed Orders operations', () => {
    for (const binding of [
      'processor.auth-login.v1',
      'processor.complete-mfa-challenge.v1',
      'processor.load-auth-session.v1',
      'processor.logout.v1',
      'orders.list-incoming-order-proposals.v1',
      'orders.accept-incoming-order-proposal.v1',
      'orders.reject-incoming-order-proposal.v1',
      'orders.restore-incoming-order-proposal.v1',
    ])
      expect(processorBrowserOperations).toHaveProperty(binding);

    expect(compositionSource).toContain(
      'makeProcessorAuthenticationBrowserClient({',
    );
    expect(compositionSource).toContain('makeProcessorOrdersBrowserClient({');
    expect(compositionSource).not.toContain('makeApiAuthenticationAdapter');
    expect(compositionSource).not.toContain('makeApiOrderManagementAdapter');
  });

  it('binds all seven browser ports to explicit Processor metadata', () => {
    for (const [factory, key, operationId] of [
      [
        'makeLoadProductionBoardClient',
        'loadBoard',
        'processor.load-production-board.v1',
      ],
      [
        'makePreviewProductionOrderBacklogClient',
        'previewOrderBacklog',
        'processor.preview-production-order-backlog.v1',
      ],
      [
        'makeLoadProductionWorkspaceClient',
        'loadWorkspace',
        'processor.load-production-workspace.v1',
      ],
      [
        'makeLoadRemainingDayForecastClient',
        'loadRemainingDayForecast',
        'processor.load-remaining-day-forecast.v1',
      ],
      [
        'makeListProductionHistoryActivityClient',
        'listHistoryActivity',
        'processor.list-production-history-activity.v1',
      ],
      [
        'makeLoadProductionHistoryRunClient',
        'loadHistoryRun',
        'processor.load-production-history-run.v1',
      ],
      [
        'makeListProductionOrderControlClient',
        'listOrderControl',
        'processor.list-production-order-control.v1',
      ],
    ] as const) {
      expect(processorBrowserOperationBindings[key].operationId).toBe(
        operationId,
      );
      expect(compositionSource).toMatch(
        new RegExp(
          `${factory}\\(\\{\\s*operation:\\s*input\\.operations\\.${key},\\s*request,?\\s*\\}\\)`,
        ),
      );
    }
  });

  it('exposes every injected query through the unchanged Production port', () => {
    const runtime = makeProcessorRuntime({
      crypto: globalThis.crypto,
      observeRequestFailure: () => undefined,
      observeConnectionState: () => undefined,
      now: () => new Date('2026-08-23T16:00:00.000Z'),
      apiBaseUrl: '/api',
      storage: browserStorageFixture(window.localStorage),
      fetch: vi.fn(),
    });

    for (const operation of [
      runtime.production.loadBoard,
      runtime.production.previewOrderBacklog,
      runtime.production.loadWorkspace,
      runtime.production.loadRemainingDayForecast,
      runtime.production.listHistoryActivity,
      runtime.production.loadHistoryRun,
      runtime.production.listOrderControl,
    ])
      expect(operation).toBeTypeOf('function');
  });
});
