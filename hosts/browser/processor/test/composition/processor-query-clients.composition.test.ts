import { describe, expect, it, vi } from 'vitest';
import { makeProcessorRuntimeFixture as makeProcessorRuntime } from '../support/processor-runtime.fixture.ts';
import { browserStorageFixture } from '../support/browser-storage.fixture.ts';
import bindingSourceText from '../../../../../generated/runtime/src/browser/processor.ts?raw';
import compositionSourceText from '../../../../../topology/runtime/browser/processor.ts?raw';

const compositionSource = compositionSourceText.replace(/\s+/g, ' ');
const bindingSource = bindingSourceText.replace(/\s+/g, ' ');

describe('Processor query-client composition', () => {
  it('binds generated authentication and only the four browser-consumed Orders operations', () => {
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
      expect(bindingSource).toMatch(
        new RegExp(`processorClient\\.operations\\[['"]${binding}['"]\\]`),
      );

    expect(compositionSource).toContain(
      'makeProcessorAuthenticationBrowserClient({',
    );
    expect(compositionSource).toContain('makeProcessorOrdersBrowserClient({');
    expect(compositionSource).not.toContain('makeApiAuthenticationAdapter');
    expect(compositionSource).not.toContain('makeApiOrderManagementAdapter');
    expect(bindingSource).not.toMatch(
      /["']\/(?:processor\/auth|order-management)\//,
    );
  });

  it('binds all seven browser ports to generated Processor metadata', () => {
    for (const binding of [
      [
        'makeLoadProductionBoardClient',
        'loadBoard',
        'processorLoadProductionBoardV1',
      ],
      [
        'makePreviewProductionOrderBacklogClient',
        'previewOrderBacklog',
        'processorPreviewProductionOrderBacklogV1',
      ],
      [
        'makeLoadProductionWorkspaceClient',
        'loadWorkspace',
        'processorLoadProductionWorkspaceV1',
      ],
      [
        'makeLoadRemainingDayForecastClient',
        'loadRemainingDayForecast',
        'processorLoadRemainingDayForecastV1',
      ],
      [
        'makeListProductionHistoryActivityClient',
        'listHistoryActivity',
        'processorListProductionHistoryActivityV1',
      ],
      [
        'makeLoadProductionHistoryRunClient',
        'loadHistoryRun',
        'processorLoadProductionHistoryRunV1',
      ],
      [
        'makeListProductionOrderControlClient',
        'listOrderControl',
        'processorListProductionOrderControlV1',
      ],
    ] as const) {
      expect(bindingSource).toContain(`${binding[1]}: ${binding[2]}`);
      expect(compositionSource).toMatch(
        new RegExp(
          `${binding[0]}\\(\\{\\s*operation:\\s*input\\.operations\\.${binding[1]},\\s*request,?\\s*\\}\\)`,
        ),
      );
    }

    for (const handwrittenPath of [
      '/workspace',
      '/forecast',
      '/order-backlog/preview',
      '/history/activity',
      '/history/runs/',
      '/order-control',
      '/board',
    ])
      expect(bindingSource).not.toContain(handwrittenPath);
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
