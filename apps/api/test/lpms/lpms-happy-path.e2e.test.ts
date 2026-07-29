import type { ProductionOrderPlacementResult } from '@pressly/contracts';
import type { OrdersApplication } from '@pressly/orders';
import {
  makeProductionApplication,
  type ProductionRepositories,
} from '@pressly/production';
import { makeMemoryProductionRepositories } from '@pressly/production/testing';
import { makeProductionPolicy } from '@pressly/production-policy';
import { makeProductionScheduler } from '@pressly/production-scheduling';
import { describe, expect, it, vi } from 'vitest';
import { normalizeCentsWebhook } from '../../src/http/webhooks/cents/cents-webhook.normalizer.ts';

const actorId = '11111111-1111-4111-8111-111111111111';
const locationId = 'location-1';

const makeIds = () => {
  let value = 1;
  return {
    next: () => `00000000-0000-4000-8000-${String(value++).padStart(12, '0')}`,
  };
};

const orders = [
  { externalOrderId: 'C-1082', weight: 150, bags: 3 },
  { externalOrderId: 'C-1094', weight: 74, bags: 2 },
  { externalOrderId: 'C-1101', weight: 140, bags: 4 },
  { externalOrderId: 'C-1106', weight: 84, bags: 2 },
  { externalOrderId: 'C-1112', weight: 130, bags: 3 },
  { externalOrderId: 'C-1118', weight: 94, bags: 2 },
  { externalOrderId: 'C-1124', weight: 128, bags: 3 },
] as const;

const demandCommand = (
  order: Readonly<{ externalOrderId: string; weight: number; bags: number }>,
  index: number,
  input: { observedAt?: string; locationId?: string; version?: number } = {},
) => {
  const observedAt = input.observedAt ?? '2026-07-10T13:59:00.000Z';
  return {
    fulfillmentId: `fulfillment:test:${order.externalOrderId}`,
    fulfillmentVersion: input.version ?? 2,
    displayReference: order.externalOrderId,
    locationId: input.locationId ?? locationId,
    observedAt,
    projectionHash: (index + 101).toString(16).padStart(64, '0'),
    admissionState: 'released' as const,
    commercialState: 'open' as const,
    dueAt: '2026-07-10T21:00:00.000Z',
    estimatedWeightLbs: order.weight,
    estimatedWeightSource: 'external_estimate' as const,
    bagCount: null,
    idempotencyKey: `demand-${index + 1}`,
  };
};

describe('LPMS run-centered app-composed happy path', () => {
  it('moves 800 lb from canonical demand through a finished fixed-pulse run', async () => {
    const ids = makeIds();
    let now = new Date('2026-07-10T14:00:00.000Z');
    const clock = { now: () => new Date(now) };
    const memory = makeMemoryProductionRepositories({ ids });
    memory.seedMachines([
      ...Array.from({ length: 4 }, (_, index) => ({
        id: ids.next(),
        stationKind: 'washing' as const,
        label: `Washer ${index + 1}`,
        effectiveCapacityLbs: 60,
        active: true,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: ids.next(),
        stationKind: 'drying' as const,
        label: `Dryer ${index + 1}`,
        effectiveCapacityLbs: 60,
        active: true,
      })),
    ]);
    const placementCommits: ProductionOrderPlacementResult[] = [];
    const placeProductionOrder: ProductionRepositories['placeProductionOrder'] =
      {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => null,
            lockLocationScheduling: async () => undefined,
            findStartedRuns: async (candidateLocationId) =>
              [...memory.inspect().runs.values()]
                .filter(
                  (candidate) =>
                    candidate.locationId === candidateLocationId &&
                    candidate.status === 'started',
                )
                .map((run) => ({
                  productionRunId: run.id,
                  queueVersion: run.queueVersion,
                })),
            recordPendingRunResolution: async () => undefined,
            loadContext: async (
              candidateLocationId,
              productionRunId,
              productionOrderId,
            ) => {
              const state = memory.inspect();
              const run = state.runs.get(productionRunId);
              const order = state.orders.get(productionOrderId);
              if (
                run === undefined ||
                run.locationId !== candidateLocationId ||
                order === undefined ||
                order.locationId !== candidateLocationId ||
                order.bagCount === null
              )
                return null;
              const shift = state.shifts.get(run.productionShiftId);
              const batches = [...state.batches.values()]
                .filter((batch) => batch.productionRunId === run.id)
                .sort((left, right) => left.sequence - right.sequence);
              const firstBatch = batches[0];
              if (shift === undefined || firstBatch === undefined) return null;

              return {
                input: {
                  order: {
                    id: order.id,
                    priority: order.priority,
                    derivedWeightLbs: order.derivedWeightLbs,
                    bagCount: order.bagCount,
                    version: order.version,
                  },
                  run: {
                    id: run.id,
                    queueVersion: run.queueVersion,
                    startsAt: shift.startsAt,
                    shiftEndsAt: shift.endsAt,
                    pulseMinutes: firstBatch.pulseMinutes,
                    pulseCapacityLbs: firstBatch.pulseCapacityLbs,
                  },
                  machines: [...state.machines.values()].map((machine) => ({
                    id: machine.id,
                    stationKind: machine.stationKind,
                    effectiveCapacityLbs: machine.effectiveCapacityLbs,
                    active: machine.active,
                  })),
                  batches: batches.map((batch) => {
                    const batchOrders = batch.orderIds.map((orderId) => {
                      const stored = state.orders.get(orderId);
                      if (stored === undefined)
                        throw new Error('Scheduled order missing from memory.');
                      return stored;
                    });
                    return {
                      id: batch.id,
                      sequence: batch.sequence,
                      status: batch.status,
                      membershipFrozen: batch.membership.state === 'frozen',
                      orderIds: [...batch.orderIds],
                      priorityOrderIds: batchOrders
                        .filter((stored) => stored.priority)
                        .map((stored) => stored.id),
                      derivedWeightLbs: batch.derivedWeightLbs,
                      bagCount: batchOrders.reduce(
                        (total, stored) => total + (stored.bagCount ?? 0),
                        0,
                      ),
                      stages: batch.stageIds.map((stageId) => {
                        const stage = state.stages.get(stageId);
                        if (stage === undefined)
                          throw new Error('Stage missing from memory.');
                        return {
                          stage: stage.stage,
                          startsAt: stage.plannedStartAt,
                          endsAt: stage.plannedEndAt,
                          machineIds: [...stage.machineIds],
                        };
                      }),
                    };
                  }),
                  mode: { type: 'automatic' as const },
                },
                runStatus: run.status,
                orderStatus: order.status,
                orderExecutionStatus: order.executionStatus,
                orderVersion: order.version,
                orderAlreadyAssigned: [
                  ...state.activeBatchOrderIds.values(),
                ].some((orderIds) => orderIds.has(order.id)),
                batchVersions: Object.fromEntries(
                  batches.map((batch) => [batch.id, batch.version]),
                ),
              };
            },
            findOvertimeProposal: async () => null,
            recordOutcome: async () => undefined,
            commitPlacement: async (input) => {
              const placement = memory.commitPlacementForTest({
                locationId: input.locationId,
                productionRunId: input.productionRunId,
                productionOrderId: input.productionOrderId,
                actorId: input.actorId,
                mode: input.mode,
                proposal: input.proposal,
                overtimeConfirmed: input.overtimeConfirmed,
                orderLifecycle: input.orderLifecycle,
                initialBatchState: input.initialBatchState,
                initialStageState: input.initialStageState,
                initialAttemptState: input.initialAttemptState,
                now: input.now,
              });
              placementCommits.push(placement);
              return placement;
            },
          }),
      };
    const application = makeProductionApplication({
      repositories: { ...memory.repositories, placeProductionOrder },
      policy: makeProductionPolicy(),
      scheduler: makeProductionScheduler(),
      clock,
      ids,
    });
    const productionOrderIds: string[] = [];

    for (const [index, order] of orders.entries()) {
      const demand = demandCommand(order, index);
      const projected = await application.applyFulfillmentDemand(demand);
      if (index === 0)
        await expect(
          application.applyFulfillmentDemand(demand),
        ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });
      expect(projected).toMatchObject({
        tag: 'ok',
        value: { outcome: 'applied' },
      });
      if (projected.tag === 'err' || projected.value.productionOrderId === null)
        return;
      productionOrderIds.push(projected.value.productionOrderId);
      if (index === 0)
        await expect(
          application.listProductionOrders({
            locationId,
            status: 'intake_pending',
            limit: 50,
          }),
        ).resolves.toMatchObject({
          tag: 'ok',
          value: { items: [{ bagCount: null, intakeVersion: null }] },
        });
      await expect(
        application.recordOrderIntake({
          locationId,
          orderId: projected.value.productionOrderId,
          bagCount: order.bags,
          expectedVersion: 1,
          actorId,
          idempotencyKey: `intake-${index + 1}`,
        }),
      ).resolves.toMatchObject({
        tag: 'ok',
        value: { bagCount: order.bags, bagCountProvenance: 'operator_intake' },
      });
    }

    await expect(
      application.applyFulfillmentDemand(
        demandCommand(orders[0], 20, {
          observedAt: '2026-07-10T13:58:00.000Z',
          version: 1,
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'ignored_older' },
    });

    await expect(
      application.applyFulfillmentDemand(
        demandCommand(
          { externalOrderId: 'unmapped-order', weight: 10, bags: 1 },
          21,
          { locationId: 'unmapped-location' },
        ),
      ),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_location_unavailable' },
    });

    const config = await application.publishSchedulerConfig({
      locationId,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      actorId,
      idempotencyKey: 'publish-config-v1',
    });
    const shift = await application.createProductionShift({
      locationId,
      startsAt: '2026-07-10T14:00:00.000Z',
      endsAt: '2026-07-10T21:00:00.000Z',
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      actorId,
      idempotencyKey: 'create-shift-v1',
    });
    expect(config.tag).toBe('ok');
    expect(shift.tag).toBe('ok');
    if (config.tag === 'err' || shift.tag === 'err') return;

    await expect(
      application.replaceShiftOrderSelection({
        locationId,
        productionShiftId: shift.value.id,
        selectedOrderIds: productionOrderIds,
        expectedVersion: 0,
        actorId,
        idempotencyKey: 'select-shift-orders-v1',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        selection: {
          productionShiftId: shift.value.id,
          selectedOrderIds: expect.arrayContaining(productionOrderIds),
        },
      },
    });

    const schedule = await application.createSchedule({
      locationId,
      productionShiftId: shift.value.id,
      schedulerConfigId: config.value.id,
      actorId,
      idempotencyKey: 'compute-schedule-v2',
    });
    expect(schedule.tag).toBe('ok');
    if (schedule.tag === 'err') return;
    expect(
      schedule.value.batches.map((batch) => batch.derivedWeightLbs),
    ).toEqual([224, 224, 224, 128]);
    expect(schedule.value.batches.map((batch) => batch.bagCount)).toEqual([
      5, 6, 5, 3,
    ]);
    expect(schedule.value).toMatchObject({
      pulseCapacityLbs: 224,
      makespanMinutes: 392,
      plannedCompletionAt: '2026-07-10T20:32:00.000Z',
    });
    expect(schedule.value.warnings).toEqual([]);

    const accepted = await application.acceptSchedule({
      locationId,
      scheduleRunId: schedule.value.scheduleRunId,
      expectedOutputPlanHash: schedule.value.outputPlanHash,
      acknowledgedWarningCodes: [],
      actorId,
      idempotencyKey: 'accept-schedule-v2',
    });
    expect(accepted.tag).toBe('ok');
    if (accepted.tag === 'err') return;
    await expect(
      application.acceptSchedule({
        locationId,
        scheduleRunId: schedule.value.scheduleRunId,
        expectedOutputPlanHash: schedule.value.outputPlanHash,
        acknowledgedWarningCodes: [],
        actorId,
        idempotencyKey: 'accept-schedule-v2',
      }),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });
    expect(memory.inspect().runs.size).toBe(0);

    const started = await application.startSchedule({
      locationId,
      scheduleRunId: accepted.value.scheduleRunId,
      expectedOutputPlanHash: schedule.value.outputPlanHash,
      actorId,
      idempotencyKey: 'start-schedule-v2',
    });
    expect(started).toMatchObject({
      tag: 'ok',
      value: { queueVersion: 1, replayed: false },
    });
    if (started.tag === 'err') return;

    let board = await application.loadProductionBoard({
      locationId,
      productionRunId: started.value.productionRunId,
    });
    expect(board.tag).toBe('ok');
    if (board.tag === 'err') return;
    expect(
      board.value.batches
        .flatMap((batch) => batch.stages)
        .flatMap((stage) => stage.allowedActions),
    ).toEqual(board.value.batches.map(() => 'start'));
    expect(
      board.value.batches.every(
        (batch) =>
          batch.stages[0]?.stage === 'sorting' &&
          batch.stages[0].allowedActions[0] === 'start' &&
          batch.stages
            .slice(1)
            .every((stage) => stage.allowedActions.length === 0),
      ),
    ).toBe(true);

    const centsPayload = {
      action: 'order_updated',
      order: {
        id: 12001,
        storeId: 24,
        status: 'SUBMITTED',
        dueDate: '2026-07-10T21:00:00.000Z',
        updatedAt: '2026-07-10T14:01:00.000Z',
      },
      services: [
        {
          id: 51,
          name: 'Wash and Fold',
          quantity: 20,
          totalPrice: 40,
          unitCost: 2,
          serviceCategoryType: 'LAUNDRY',
        },
      ],
    } as const;
    const centsRawBody = new TextEncoder().encode(JSON.stringify(centsPayload));
    const normalized = normalizeCentsWebhook({
      payload: centsPayload,
      rawBody: centsRawBody,
    });
    expect(normalized).toMatchObject({
      ok: true,
      value: {
        disposition: 'propose_order_candidate',
        order: { externalOrderId: '12001', bagCount: null },
      },
    });
    if (
      !normalized.ok ||
      normalized.value.disposition !== 'propose_order_candidate'
    )
      return;
    const centsOrder = normalized.value.order;
    const centsWeightLbs = centsOrder.services.reduce(
      (total, service) =>
        total + service.totalPriceCents / service.unitPriceCents,
      0,
    );
    const proposalId = '00000000-0000-4000-8000-000000001201';
    const canonicalOrderId = '00000000-0000-4000-8000-000000001202';
    const canonicalFulfillmentId = '00000000-0000-4000-8000-000000001203';
    const proposeIncomingOrder = vi.fn<
      OrdersApplication['proposeIncomingOrder']
    >(async () => ({
      tag: 'ok',
      value: {
        proposalId,
        version: 1,
        replayed: false,
        outcome: 'proposed',
      },
    }));
    const acceptIncomingOrderProposal = vi.fn<
      OrdersApplication['acceptIncomingOrderProposal']
    >(async () => ({
      tag: 'ok',
      value: {
        proposalId,
        state: 'accepted',
        version: 2,
        orderId: canonicalOrderId,
        fulfillmentId: canonicalFulfillmentId,
        replayed: false,
      },
    }));
    const proposed = await proposeIncomingOrder({
      context: {
        origin: 'cents',
        principal: { kind: 'system', id: 'cents-webhook' },
      },
      proposalKind: 'submitted_order',
      source: 'cents',
      externalOrderId: centsOrder.externalOrderId,
      revision: {
        at: new Date(centsOrder.sourceUpdatedAt),
        hash: normalized.value.receipt.rawBodySha256,
        adapterVersion: 'cents-webhook-v3',
        observedAt: new Date(centsOrder.sourceUpdatedAt),
        normalizedPayload: centsOrder,
      },
      snapshot: {
        customer:
          centsOrder.customer === null
            ? null
            : {
                externalUserId: centsOrder.customer.externalUserId,
                firstName: centsOrder.customer.firstName,
                lastName: centsOrder.customer.lastName,
                businessName: centsOrder.customer.businessName,
                phone: centsOrder.customer.phone,
                email: centsOrder.customer.email,
                normalizedPayload: {
                  externalUserId: centsOrder.customer.externalUserId,
                },
              },
        displayNumber: centsOrder.orderCode,
        dueAt: new Date(centsOrder.dueAt),
        currency: 'USD',
        totalAmountCents: centsOrder.totalAmountCents,
        balanceDueCents: centsOrder.balanceDueCents,
        items: centsOrder.services.map((service) => ({
          lineKey: service.externalServiceId,
          itemType: 'service',
          code: service.category,
          description: service.name,
          quantity: service.quantity,
          unit: 'service_unit',
          unitPriceCents: service.unitPriceCents,
          totalAmountCents: service.totalPriceCents,
          sourceMetadata: {},
        })),
        fulfillment: {
          typeCode: 'wash_fold',
          locationId,
          estimatedWeightLbs: centsWeightLbs,
          estimatedWeightSource: 'source_estimate',
        },
      },
    });
    expect(proposed).toMatchObject({
      tag: 'ok',
      value: { proposalId, outcome: 'proposed' },
    });
    if (proposed.tag === 'err' || proposed.value.proposalId === null) return;
    const acceptedOrder = await acceptIncomingOrderProposal({
      proposalId: proposed.value.proposalId,
      locationId,
      expectedVersion: 1,
      idempotencyKey: 'accept-cents-arrival-12001',
      context: {
        origin: 'pressly_processor',
        principal: { kind: 'human', id: actorId },
      },
      reasonCode: 'incoming_order_accepted',
      reasonNote: null,
    });
    expect(acceptedOrder).toMatchObject({
      tag: 'ok',
      value: {
        proposalId,
        state: 'accepted',
        orderId: canonicalOrderId,
        fulfillmentId: canonicalFulfillmentId,
      },
    });
    if (
      acceptedOrder.tag === 'err' ||
      acceptedOrder.value.fulfillmentId === null
    )
      return;
    const arrival = await application.applyFulfillmentDemand({
      fulfillmentId: acceptedOrder.value.fulfillmentId,
      fulfillmentVersion: 1,
      displayReference: centsOrder.orderCode,
      locationId,
      observedAt: centsOrder.sourceUpdatedAt,
      projectionHash: normalized.value.receipt.rawBodySha256,
      admissionState: 'released',
      commercialState: 'open',
      dueAt: centsOrder.dueAt,
      estimatedWeightLbs: centsWeightLbs,
      estimatedWeightSource: 'external_estimate',
      bagCount: centsOrder.bagCount,
      idempotencyKey: 'webhook:cents-arrival-12001',
    });
    expect(arrival).toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied' },
    });
    if (arrival.tag === 'err' || arrival.value.productionOrderId === null)
      return;
    const priority = await application.setProductionOrderPriority({
      locationId,
      productionOrderId: arrival.value.productionOrderId,
      priority: true,
      expectedVersion: 1,
      actorId,
      idempotencyKey: 'priority-cents-arrival-12001',
    });
    expect(priority).toMatchObject({
      tag: 'ok',
      value: { version: 2 },
    });
    await expect(
      application.recordOrderIntake({
        locationId,
        orderId: arrival.value.productionOrderId,
        bagCount: 1,
        expectedVersion: 2,
        actorId,
        idempotencyKey: 'intake-cents-arrival-12001',
      }),
    ).resolves.toMatchObject({ tag: 'ok', value: { version: 3 } });
    expect(placementCommits).toEqual([]);
    await expect(
      application.placeProductionOrder.placeAutomatically({
        locationId,
        productionRunId: started.value.productionRunId,
        productionOrderId: arrival.value.productionOrderId,
        expectedQueueVersion: 1,
        actorId,
        actorRole: 'owner',
        idempotencyKey: 'manager-add-arrival-12001',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'placed',
        productionOrderId: arrival.value.productionOrderId,
      },
    });
    expect(placementCommits).toEqual([
      expect.objectContaining({
        status: 'placed',
        mode: 'automatic',
        productionRunId: started.value.productionRunId,
        productionOrderId: arrival.value.productionOrderId,
        productionBatchId: started.value.productionBatchIds[3],
        queueVersion: 2,
        overtimeMinutes: 0,
      }),
    ]);
    board = await application.loadProductionBoard({
      locationId,
      productionRunId: started.value.productionRunId,
    });
    expect(board).toMatchObject({
      tag: 'ok',
      value: {
        productionRun: { queueVersion: 2 },
        batches: [
          {},
          {},
          {},
          {
            derivedWeightLbs: 148,
            orders: [
              {},
              {
                id: arrival.value.productionOrderId,
                placementProvenance: 'automatic',
                pinnedAt: null,
                pinnedBy: null,
              },
            ],
          },
        ],
      },
    });

    const boundaries = [
      ...new Set(
        schedule.value.batches.flatMap((batch) =>
          batch.stages.flatMap((stage) => [stage.startsAt, stage.endsAt]),
        ),
      ),
    ].sort((left, right) => Date.parse(left) - Date.parse(right));
    let provedEarlyBoundary = false;

    for (const boundary of boundaries) {
      now = new Date(boundary);
      board = await application.loadProductionBoard({
        locationId,
        productionRunId: started.value.productionRunId,
      });
      if (board.tag === 'err') return;

      for (const stage of board.value.batches
        .flatMap((batch) => batch.stages)
        .filter(
          (stage) =>
            stage.status === 'started' && stage.plannedEndAt === boundary,
        )) {
        if (!provedEarlyBoundary) {
          now = new Date(Date.parse(boundary) - 1);
          const earlyCompletion = await application.advanceProductionStage({
            locationId,
            stageRunId: stage.id,
            transition: 'complete',
            expectedVersion: stage.version,
            actorId,
            idempotencyKey: 'early-completion-proof',
          });
          expect(earlyCompletion).toMatchObject({
            tag: 'ok',
            value: {
              status: 'confirmation_required',
              stageRunId: stage.id,
              stageVersion: stage.version,
              code: 'PULSE_BOUNDARY_NOT_REACHED',
              timing: { remainingMilliseconds: 1 },
              replayed: false,
            },
          });
          expect(memory.inspect().stages.get(stage.id)?.status).toBe('started');
          now = new Date(boundary);
          provedEarlyBoundary = true;
        }
        const completed = await application.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          transition: 'complete',
          expectedVersion: stage.version,
          actorId,
          idempotencyKey: `complete-${stage.id}`,
        });
        expect(completed).toMatchObject({ tag: 'ok' });
      }

      board = await application.loadProductionBoard({
        locationId,
        productionRunId: started.value.productionRunId,
      });
      if (board.tag === 'err') return;
      if (boundary === '2026-07-10T14:56:00.000Z')
        expect(
          [...memory.inspect().stages.values()]
            .filter((stage) => stage.stage === 'sorting')
            .map((stage) => stage.status),
        ).toEqual(['completed', 'planned', 'planned', 'planned']);
      const stagesStartingNow = board.value.batches
        .flatMap((batch) => batch.stages)
        .filter(
          (stage) =>
            stage.status === 'planned' && stage.plannedStartAt === boundary,
        );
      if (boundary === '2026-07-10T14:56:00.000Z') {
        const sorting = stagesStartingNow.find(
          (stage) => stage.stage === 'sorting',
        )!;
        const context = await memory.inspectStageTransitionContext(
          sorting.id,
          now,
        );
        expect(context).toMatchObject({
          productionRunStarted: true,
          previousStageCompleted: true,
          sameKindAlreadyActive: false,
        });
      }
      expect(
        stagesStartingNow.map((stage) => stage.allowedActions),
        `start actions at ${boundary}`,
      ).toEqual(stagesStartingNow.map(() => ['start']));
      for (const stage of stagesStartingNow) {
        const started = await application.advanceProductionStage({
          locationId,
          stageRunId: stage.id,
          transition: 'start',
          expectedVersion: stage.version,
          actorId,
          idempotencyKey: `start-${stage.id}`,
        });
        expect(started).toMatchObject({ tag: 'ok' });
      }
    }

    board = await application.loadProductionBoard({
      locationId,
      productionRunId: started.value.productionRunId,
    });
    if (board.tag === 'ok')
      expect(
        board.value.batches.map((batch) =>
          batch.stages.map((stage) => ({
            stage: stage.stage,
            status: stage.status,
            start: stage.plannedStartAt,
            end: stage.plannedEndAt,
            actions: stage.allowedActions,
          })),
        ),
      ).toEqual(
        board.value.batches.map((batch) =>
          batch.stages.map((stage) => ({
            stage: stage.stage,
            status: 'completed',
            start: stage.plannedStartAt,
            end: stage.plannedEndAt,
            actions: [],
          })),
        ),
      );
    if (board.tag === 'ok')
      expect(
        board.value.batches.map((batch) => batch.membership.state),
      ).toEqual(board.value.batches.map(() => 'frozen'));
    expect(board).toMatchObject({
      tag: 'ok',
      value: {
        productionRun: { status: 'completed' },
        batches: [
          { status: 'finished' },
          { status: 'finished' },
          { status: 'finished' },
          { status: 'finished' },
        ],
      },
    });
    expect(
      memory.inspect().orders.get(arrival.value.productionOrderId),
    ).toMatchObject({ status: 'finished' });
    expect(
      memory.inspect().bagStatuses.get(arrival.value.productionOrderId),
    ).toEqual(['finished']);
  });
});
