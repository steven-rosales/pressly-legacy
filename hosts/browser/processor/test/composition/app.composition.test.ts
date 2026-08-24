import { describe, expect, it, vi } from 'vitest';
import { makeProcessorRuntimeFixture as makeProcessorRuntime } from '../support/processor-runtime.fixture.ts';
import { browserStorageFixture } from '../support/browser-storage.fixture.ts';
import {
  productionAcceptScheduleV1,
  productionAssignStageMachinesV1,
  productionCommitOrderBacklogV1,
  productionCommitOrderRouteV1,
  productionFreezeBatchMembershipV1,
  productionListHistoryPlansV1,
  productionListHistoryRunsV1,
  productionListLocationsV1,
  productionListOrdersV1,
  productionLoadScheduleV1,
  productionPreviewOrderRouteV1,
  productionPublishSchedulerConfigV1,
  productionReconcileBatchProgressV1,
  productionSetOrderPriorityV1,
  productionSubscribeChangesV1,
  productionUnfreezeBatchMembershipV1,
  productionUpdateShiftV1,
} from '@pressly/generated/clients/processor';
import {
  testConfig,
  testSchedule,
  testWorkspace,
} from '../../../../../experiences/processor/test/fixtures/production.fixture.ts';

const browserMechanisms = {
  crypto: globalThis.crypto,
  observeRequestFailure: () => undefined,
  observeConnectionState: () => undefined,
  now: () => new Date('2026-08-23T16:00:00.000Z'),
} as const;

describe('Processor generated production composition', () => {
  it('injects generated accept metadata while browser fetch retains the idempotent effect', async () => {
    const accepted = {
      scheduleRunId: '41000000-0000-4000-8000-000000000001',
      productionShiftId: '41000000-0000-4000-8000-000000000002',
      acceptedAt: '2026-08-22T16:00:00.000Z',
      replayed: false,
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: accepted }), {
        status: 201,
      }),
    );
    const runtime = makeProcessorRuntime({
      ...browserMechanisms,
      apiBaseUrl: '/api/',
      storage: browserStorageFixture(window.localStorage),
      fetch,
    });
    const command = {
      locationId: 'pressly one/north',
      scheduleRunId: accepted.scheduleRunId,
      expectedOutputPlanHash: 'a'.repeat(64),
      acknowledgedWarningCodes: [
        'SHIFT_OVERFLOW' as const,
        'OVERSIZED_ORDER' as const,
      ],
      idempotencyKey: 'accept-schedule-command-1',
    };

    await expect(runtime.production.acceptSchedule(command)).resolves.toEqual(
      accepted,
    );

    expect(fetch).toHaveBeenCalledWith(
      `/api${productionAcceptScheduleV1.http.accept.path
        .replace(':locationId', 'pressly%20one%2Fnorth')
        .replace(':scheduleRunId', accepted.scheduleRunId)}`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({
          expectedOutputPlanHash: command.expectedOutputPlanHash,
          acknowledgedWarningCodes: command.acknowledgedWarningCodes,
          idempotencyKey: command.idempotencyKey,
        }),
      }),
    );
  });

  it('injects generated commit-backlog metadata while browser fetch keeps the idempotent effect', async () => {
    const result = {
      locationId: 'pressly one/north',
      bulkOperationId: '32000000-0000-4000-8000-000000000001',
      previewHash: 'a'.repeat(64),
      nextCursor: null,
      resolvedCount: 1,
      resolved: [
        {
          orderId: '32000000-0000-4000-8000-000000000002',
          resolutionState: 'resolved_without_production' as const,
          version: 3,
        },
      ],
      committedAt: '2026-08-22T16:00:00.000Z',
      replayed: false,
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: result }), {
        status: 200,
      }),
    );
    const runtime = makeProcessorRuntime({
      ...browserMechanisms,
      apiBaseUrl: '/api/',
      storage: browserStorageFixture(window.localStorage),
      fetch,
    });
    const request = {
      filter: 'all_due_before_cutoff' as const,
      cutoff: '2026-08-01T00:00:00.000Z',
      reason: 'processor_not_in_use' as const,
      cursor: null,
      maxOrders: 250,
      note: null,
      previewHash: result.previewHash,
      idempotencyKey: 'commit-order-backlog-command-1',
    };

    await expect(
      runtime.production.commitOrderBacklog({
        locationId: result.locationId,
        request,
      }),
    ).resolves.toEqual(result);

    expect(fetch).toHaveBeenCalledWith(
      `/api${productionCommitOrderBacklogV1.http['order-backlog'].path.replace(
        ':locationId',
        'pressly%20one%2Fnorth',
      )}`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify(request),
      }),
    );
  });

  it('injects generated commit-route metadata while browser fetch keeps the proposal-bound idempotent effect', async () => {
    const proposal = {
      kind: 'queued_move' as const,
      productionRunId: '41000000-0000-4000-8000-000000000011',
      productionOrderId: '41000000-0000-4000-8000-000000000012',
      sourceProductionBatchId: '41000000-0000-4000-8000-000000000013',
      sourceBatchSequence: 0,
      targetProductionBatchId: '41000000-0000-4000-8000-000000000014',
      targetBatchSequence: 1,
      restartStage: 'sorting' as const,
      releasedStages: ['sorting' as const],
      assignedStages: [
        'sorting' as const,
        'washing' as const,
        'drying' as const,
        'folding_packaging' as const,
      ],
      orderWeightLbs: 25,
      targetWeightLbs: 75,
      targetCapacityLbs: 100,
      expectedQueueVersion: 2,
      expectedOrderVersion: 3,
      expectedSourceBatchVersion: 4,
      expectedTargetBatchVersion: 5,
      proposalHash: 'b'.repeat(64),
    };
    const result = {
      status: 'routed' as const,
      proposal,
      queueVersion: 3,
      orderVersion: 4,
      sourceBatchVersion: 5,
      targetBatchVersion: 6,
      createdAttemptIds: ['41000000-0000-4000-8000-000000000015'],
      replayed: false,
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: result }), {
        status: 200,
      }),
    );
    const runtime = makeProcessorRuntime({
      ...browserMechanisms,
      apiBaseUrl: '/api/',
      storage: browserStorageFixture(window.localStorage),
      fetch,
    });
    const request = {
      kind: 'queued_move' as const,
      reason: 'manual_rebatch' as const,
      targetProductionBatchId: proposal.targetProductionBatchId,
      restartStage: proposal.restartStage,
      expectedQueueVersion: proposal.expectedQueueVersion,
      expectedOrderVersion: proposal.expectedOrderVersion,
      expectedSourceBatchVersion: proposal.expectedSourceBatchVersion,
      proposalHash: proposal.proposalHash,
      idempotencyKey: 'commit-order-route-command-1',
    };

    await expect(
      runtime.production.commitOrderRoute({
        locationId: 'pressly one/north',
        productionRunId: proposal.productionRunId,
        productionOrderId: proposal.productionOrderId,
        request,
      }),
    ).resolves.toEqual(result);

    expect(fetch).toHaveBeenCalledWith(
      `/api${productionCommitOrderRouteV1.http.route.path
        .replace(':locationId', 'pressly%20one%2Fnorth')
        .replace(':productionRunId', proposal.productionRunId)
        .replace(':productionOrderId', proposal.productionOrderId)}`,
      expect.objectContaining({
        method: productionCommitOrderRouteV1.http.route.method,
        credentials: 'same-origin',
        body: JSON.stringify(request),
      }),
    );
  });

  it('injects generated publish-config metadata while browser fetch owns the effect', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: testConfig }), {
        status: 201,
      }),
    );
    const runtime = makeProcessorRuntime({
      ...browserMechanisms,
      apiBaseUrl: '/api/',
      storage: browserStorageFixture(window.localStorage),
      fetch,
    });
    const command = {
      locationId: 'pressly one/north',
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      stageFitAssertion: {
        sortingFits: true as const,
        washingFits: true as const,
        dryingFits: true as const,
      },
      idempotencyKey: 'publish-config-command-1',
    };

    await expect(runtime.production.publishConfig(command)).resolves.toEqual(
      testConfig,
    );

    expect(fetch).toHaveBeenCalledWith(
      `/api${productionPublishSchedulerConfigV1.http[
        'scheduler-configs'
      ].path.replace(':locationId', 'pressly%20one%2Fnorth')}`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({
          pulseMinutes: command.pulseMinutes,
          foldLbsPerFolderMinute: command.foldLbsPerFolderMinute,
          stageFitAssertion: command.stageFitAssertion,
          idempotencyKey: command.idempotencyKey,
        }),
      }),
    );
  });

  it('injects generated load-schedule metadata and canonical response decoding', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: testSchedule }), {
        status: 200,
      }),
    );
    const runtime = makeProcessorRuntime({
      ...browserMechanisms,
      apiBaseUrl: '/api/',
      storage: browserStorageFixture(window.localStorage),
      fetch,
    });

    await expect(
      runtime.production.loadSchedule('pressly one/north', 'schedule/id'),
    ).resolves.toEqual(testSchedule);

    expect(fetch).toHaveBeenCalledWith(
      `/api${productionLoadScheduleV1.http.request.path
        .replace(':locationId', 'pressly%20one%2Fnorth')
        .replace(':scheduleRunId', 'schedule%2Fid')}`,
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
  });

  it('injects generated update-shift metadata and preserves the version-bound idempotent body', async () => {
    const currentShift = testWorkspace.currentShift!;
    const result = {
      productionShift: {
        ...currentShift,
        effectiveFolderCount: 3,
        version: currentShift.version + 1,
      },
      supersededScheduleRunId: null,
      replayed: false,
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: result }), {
        status: 200,
      }),
    );
    const runtime = makeProcessorRuntime({
      ...browserMechanisms,
      apiBaseUrl: '/api/',
      storage: browserStorageFixture(window.localStorage),
      fetch,
    });
    const command = {
      locationId: 'pressly one/north',
      productionShiftId: currentShift.id,
      startsAt: currentShift.startsAt,
      endsAt: currentShift.endsAt,
      effectiveFolderCount: 3,
      expectedVersion: currentShift.version,
      idempotencyKey: 'update-shift-command-1',
    };

    await expect(runtime.production.updateShift(command)).resolves.toEqual(
      result,
    );

    expect(fetch).toHaveBeenCalledWith(
      `/api${productionUpdateShiftV1.http.request.path
        .replace(':locationId', 'pressly%20one%2Fnorth')
        .replace(':productionShiftId', encodeURIComponent(currentShift.id))}`,
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'same-origin',
        body: JSON.stringify({
          startsAt: command.startsAt,
          endsAt: command.endsAt,
          effectiveFolderCount: command.effectiveFolderCount,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
        }),
      }),
    );
  });

  it('injects generated read and route-preview metadata with browser query semantics', async () => {
    const asOf = '2026-08-21T14:00:00.000Z';
    const runId = '11111111-1111-4111-8111-111111111111';
    const orderId = '22222222-2222-4222-8222-222222222222';
    const sourceBatchId = '33333333-3333-4333-8333-333333333333';
    const targetBatchId = '44444444-4444-4444-8444-444444444444';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { items: [], asOf } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { items: [], nextCursor: null, asOf },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { items: [], nextCursor: null, asOf },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              kind: 'queued_move',
              productionRunId: runId,
              productionOrderId: orderId,
              sourceProductionBatchId: sourceBatchId,
              sourceBatchSequence: 0,
              targetProductionBatchId: targetBatchId,
              targetBatchSequence: 1,
              restartStage: 'sorting',
              releasedStages: ['sorting'],
              assignedStages: [
                'sorting',
                'washing',
                'drying',
                'folding_packaging',
              ],
              orderWeightLbs: 25,
              targetWeightLbs: 75,
              targetCapacityLbs: 100,
              expectedQueueVersion: 2,
              expectedOrderVersion: 3,
              expectedSourceBatchVersion: 4,
              expectedTargetBatchVersion: 5,
              proposalHash: 'a'.repeat(64),
            },
          }),
          { status: 200 },
        ),
      );
    const runtime = makeProcessorRuntime({
      ...browserMechanisms,
      apiBaseUrl: '/api/',
      storage: browserStorageFixture(window.localStorage),
      fetch,
    });
    const controller = new AbortController();

    await runtime.production.listLocations();
    await runtime.production.listOrders({
      locationId: 'pressly one',
      query: {
        limit: 25,
        status: 'scheduled',
        dueAfter: '2026-08-20T14:00:00.000Z',
        dueBefore: '2026-08-22T14:00:00.000Z',
        cursor: 'next cursor',
      },
      signal: controller.signal,
    });
    await runtime.production.listHistoryRuns({
      locationId: 'pressly one',
      query: {
        limit: 50,
        cursor: 'history cursor',
        search: 'north & east',
        status: 'completed',
        createdAfter: '2026-08-20T14:00:00.000Z',
      },
      signal: controller.signal,
    });
    const routeRequest = {
      kind: 'queued_move' as const,
      reason: 'manual_rebatch' as const,
      targetProductionBatchId: targetBatchId,
      restartStage: 'sorting' as const,
      expectedQueueVersion: 2,
      expectedOrderVersion: 3,
      expectedSourceBatchVersion: 4,
    };
    await runtime.production.previewOrderRoute({
      locationId: 'pressly one',
      productionRunId: runId,
      productionOrderId: orderId,
      request: routeRequest,
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `/api${productionListLocationsV1.http.locations.path}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `/api${productionListOrdersV1.http.orders.path.replace(
        ':locationId',
        'pressly%20one',
      )}?limit=25&status=scheduled&dueAfter=2026-08-20T14%3A00%3A00.000Z&dueBefore=2026-08-22T14%3A00%3A00.000Z&cursor=next+cursor`,
      expect.objectContaining({ method: 'GET', signal: controller.signal }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `/api${productionListHistoryRunsV1.http.runs.path.replace(
        ':locationId',
        'pressly%20one',
      )}?limit=50&cursor=history+cursor&search=north+%26+east&status=completed&createdAfter=2026-08-20T14%3A00%3A00.000Z`,
      expect.objectContaining({ method: 'GET', signal: controller.signal }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      `/api${productionPreviewOrderRouteV1.http.preview.path
        .replace(':locationId', 'pressly%20one')
        .replace(':productionRunId', runId)
        .replace(':productionOrderId', orderId)}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(routeRequest),
      }),
    );
  });

  it('injects generated production transports into browser adapters', async () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const batchId = '22222222-2222-4222-8222-222222222222';
    const stageId = '33333333-3333-4333-8333-333333333333';
    const actorId = '44444444-4444-4444-8444-444444444444';
    const stageVersions = [
      stageId,
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
    ].map((stageRunId) => ({ stageRunId, version: 1 }));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              entityId: '11111111-1111-4111-8111-111111111111',
              version: 3,
              replayed: false,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              items: [],
              nextCursor: null,
              asOf: '2026-08-21T14:00:00.000Z',
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { entityId: stageId, version: 2, replayed: false },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              productionRunId: runId,
              productionBatchId: batchId,
              queueVersion: 2,
              batchVersion: 2,
              membership: {
                state: 'frozen',
                frozenAt: '2026-08-21T14:00:00.000Z',
                frozenBy: actorId,
              },
              replayed: false,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              productionRunId: runId,
              productionBatchId: batchId,
              queueVersion: 3,
              batchVersion: 3,
              membership: { state: 'mutable' },
              replayed: false,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              status: 'confirmation_required',
              productionRunId: runId,
              productionBatchId: batchId,
              currentMilestone: 'waiting_to_sort',
              targetMilestone: 'sorting_started',
              queueVersion: 1,
              batchVersion: 1,
              stageVersions,
              confirmation: { proposalHash: 'a'.repeat(64) },
              effects: {
                completedStages: [],
                activeStage: 'sorting',
                finishesBatch: false,
                finishesRun: false,
                closesShift: false,
              },
              replayed: false,
            },
          }),
          { status: 200 },
        ),
      );
    const close = vi.fn();
    const eventSourceFactory = vi.fn(() => ({
      addEventListener: vi.fn(),
      close,
    }));
    const runtime = makeProcessorRuntime({
      ...browserMechanisms,
      apiBaseUrl: '/api/',
      storage: browserStorageFixture(window.localStorage),
      fetch,
      eventSourceFactory,
    });

    await runtime.production.setPriority({
      locationId: 'pressly one',
      productionOrderId: 'order/42',
      priority: true,
      expectedVersion: 2,
      idempotencyKey: 'set-priority-1',
    });
    const controller = new AbortController();
    await runtime.production.listHistoryPlans({
      locationId: 'pressly one',
      query: { limit: 50, search: 'north & east' },
      signal: controller.signal,
    });
    await runtime.production.assignStageMachines({
      locationId: 'pressly one',
      stageRunId: stageId,
      machineIds: [actorId],
      expectedVersion: 1,
      idempotencyKey: 'assign-machines-1',
    });
    const membershipCommand = {
      locationId: 'pressly one',
      productionRunId: runId,
      productionBatchId: batchId,
      expectedQueueVersion: 1,
      expectedBatchVersion: 1,
      idempotencyKey: 'membership-command-1',
    };
    await runtime.production.freezeBatch(membershipCommand);
    await runtime.production.unfreezeBatch(membershipCommand);
    await runtime.production.reconcileBatchProgress({
      locationId: 'pressly one',
      productionRunId: runId,
      productionBatchId: batchId,
      expectedQueueVersion: 1,
      expectedBatchVersion: 1,
      expectedStageVersions: stageVersions,
      target: 'sorting_started',
      reason: 'updates_missed',
      machineIds: [],
      idempotencyKey: 'reconcile-command-1',
    });
    const unsubscribe = runtime.productionChanges.subscribe({
      locationId: 'pressly one',
      onInvalidate: vi.fn(),
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `/api${productionSetOrderPriorityV1.http.priority.path
        .replace(':locationId', 'pressly%20one')
        .replace(':productionOrderId', 'order%2F42')}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          priority: true,
          expectedVersion: 2,
          idempotencyKey: 'set-priority-1',
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `/api${productionListHistoryPlansV1.http.plans.path.replace(
        ':locationId',
        'pressly%20one',
      )}?limit=50&search=north+%26+east`,
      expect.objectContaining({
        method: 'GET',
        signal: controller.signal,
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `/api${productionAssignStageMachinesV1.http.machines.path
        .replace(':locationId', 'pressly%20one')
        .replace(':stageRunId', stageId)}`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          machineIds: [actorId],
          expectedVersion: 1,
          idempotencyKey: 'assign-machines-1',
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      `/api${productionFreezeBatchMembershipV1.http.freeze.path
        .replace(':locationId', 'pressly%20one')
        .replace(':productionRunId', runId)
        .replace(':productionBatchId', batchId)}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedQueueVersion: 1,
          expectedBatchVersion: 1,
          idempotencyKey: 'membership-command-1',
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      `/api${productionUnfreezeBatchMembershipV1.http.unfreeze.path
        .replace(':locationId', 'pressly%20one')
        .replace(':productionRunId', runId)
        .replace(':productionBatchId', batchId)}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedQueueVersion: 1,
          expectedBatchVersion: 1,
          idempotencyKey: 'membership-command-1',
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      `/api${productionReconcileBatchProgressV1.http[
        'progress-reconciliation'
      ].path
        .replace(':locationId', 'pressly%20one')
        .replace(':productionRunId', runId)
        .replace(':productionBatchId', batchId)}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          expectedQueueVersion: 1,
          expectedBatchVersion: 1,
          expectedStageVersions: stageVersions,
          target: 'sorting_started',
          reason: 'updates_missed',
          machineIds: [],
          idempotencyKey: 'reconcile-command-1',
        }),
      }),
    );
    expect(eventSourceFactory).toHaveBeenCalledWith(
      `/api${productionSubscribeChangesV1.eventStream.path.replace(
        ':locationId',
        'pressly%20one',
      )}`,
      { withCredentials: true },
    );

    unsubscribe();
    expect(close).toHaveBeenCalledOnce();
  });
});
