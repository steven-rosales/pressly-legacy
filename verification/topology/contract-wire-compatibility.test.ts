import * as controlCli from '@pressly/experience-control/contracts/cli-v1';
import * as controlOrders from '@pressly/experience-control/contracts/orders-v1';
import * as processorAuthentication from '@pressly/experience-processor/contracts/authentication-v1';
import * as processorHistory from '@pressly/experience-processor/contracts/production-history';
import * as processorOperationalOrder from '@pressly/experience-processor/contracts/operational-order';
import * as ingressCents from '@pressly/ingress-system/contracts/cents-v1';
import * as ingressWebhook from '@pressly/ingress-system/contracts/webhook-ingestion-v1';
import {
  fulfillmentDemandChangedV2MessageContract,
  fulfillmentDemandChangedV2PayloadSchema,
} from '@pressly/orders-system/contracts/fulfillment-demand-changed-v2';
import {
  acceptIncomingOrderProposalHttpBodySchema,
  rejectIncomingOrderProposalHttpBodySchema,
  restoreIncomingOrderProposalHttpBodySchema,
} from '@pressly/orders-system/http/order-management';
import { pricingCatalogHttpResultSchema } from '@pressly/pricing-system/http/catalog';
import * as changeOrderResolution from '@pressly/production-system/contracts/demand/change-order-resolution';
import * as loadRemainingDayForecast from '@pressly/production-system/contracts/queries/load-remaining-day-forecast';
import * as productionHistory from '@pressly/production-system/contracts/read-models/production-history';
import * as productionOrderBacklog from '@pressly/production-system/contracts/read-models/production-order-backlog';
import * as productionOrderControl from '@pressly/production-system/contracts/read-models/production-order-control';
import * as updateShift from '@pressly/production-system/contracts/scheduling/update-shift';
import { afterAll, describe, expect, it } from 'vitest';

import {
  expectBoundaryWireParity,
  expectZodWireParity,
  observedWireBehaviorDigests,
} from './contract-compatibility.helpers.ts';

afterAll(() => {
  expect(Object.fromEntries([...observedWireBehaviorDigests].sort())).toEqual({
    'Accept incoming Order proposal':
      '30bae07a209f74a6a25679390d6fbd8c4327e97f5ef7750a9152e2d5fdd233da',
    'Cents submitted-order candidate':
      'd89e03175133a4dd9334a6b2f701d623802d79b41bf480e2c0ea0de6ab060039',
    'Cents webhook envelope':
      '80f56700d6051243bdd0d79bf196ebaa106dc79043494a2380dc295786b9e649',
    'Control order detail':
      '12e25ecf04916bee9170c195600b39eedbb06930b3b840cae9559d0dbaf879b5',
    'Control pricing plan':
      '136e6f56bff2826f9c1d7e8c71d20cfd2236dd5cec10142f9c3a8045eabba24c',
    'Control pricing publish result':
      '66f92a90a013f5047df5b04e4b589a4bcb012b2406bcee90d3ad620c1ebb7860',
    'Fulfillment demand event':
      '9626f83c198b359ccb251ae0ffa927a3a9a3ace2e2a1d5acee4adade803ced56',
    'Fulfillment demand message payload':
      '9626f83c198b359ccb251ae0ffa927a3a9a3ace2e2a1d5acee4adade803ced56',
    'Pricing catalog HTTP result':
      '9609ce7afa7351194c896bf70e33b1fee701a0333f8b30fdb314a8050cfbf835',
    'Processor authenticated session':
      'ce2f175b218423cd12189584de2049efe15e8adf1e90dc9a0e41220cec9105ba',
    'Processor history activity identity':
      '6221a6623838bea12951cc83e34cae3d5fbef6060c455ba53be40d6cfb866c35',
    'Processor operational identity':
      '6bf91679721346523cfc7ce7a2313d288fe9160348387be816eda9bf1a120986',
    'Production Order command capabilities':
      'bdf700e3f191617b0a038f4219b7c595781b56b3daacb558069bf5d21a264995',
    'Production Order resolution':
      '0f80f9d6403dcc14122995551a6cd115af8e55d855200f4757e766dd65c8c33a',
    'Production backlog commit':
      '2dbd0de6c73d76c3a4de8ef2f142cc80c2bbeaddba5de4a333a6c0e1e9fbce02',
    'Production history aggregates':
      '379fd32e1162767a353e15581cd637585e1971f8fec9b670bc810c33a73ebc05',
    'Production service day':
      '153af9f2e90e0334a1c06a12dd52ae13d2c8aa1a961298cd5a5dce9055be0f5d',
    'Production shift update':
      '3dafad0228a645c9a6bc22e2206809f6611ea3445e7c439525ff9b78f409c0a6',
    'Reject incoming Order proposal':
      '9d46dc83a54c73e94de6622a40e851ac7c162030226db471d5debc9417d7f4dc',
    'Restore incoming Order proposal':
      '60dc2b4a3faf760b7f5392ac891f08f00967305f55d8d61d8148d6fc260abeb4',
    'Webhook ingest command':
      'b75b3c89b7393f5ccddf4969cc35190799ddf7459cca10b47bd47194c6e17d2e',
    'Webhook source-location manifest':
      '896e13a573b28d8dc058b7e6ac742e1581857392186ed0192016ffe9f35b9030',
  });
});

const id = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

const processorPrincipal = Object.freeze({
  identityId: id(1),
  displayName: 'Operator One',
  email: 'operator@example.com',
});

const processorAccess = Object.freeze({
  locations: [
    {
      id: 'pressly-one',
      name: 'Pressly One',
      timezone: 'America/New_York',
      capabilities: ['processor:view', 'production:read', 'production:intake'],
    },
  ],
  applications: [
    {
      id: 'processor',
      label: 'Pressly Processor',
      description: 'Run laundry-floor production.',
      href: 'https://processor.trypressly.com',
    },
  ],
});

const processorSession = Object.freeze({
  status: 'authenticated',
  principal: processorPrincipal,
  access: processorAccess,
  expiresAt: '2026-08-01T20:00:00.000Z',
  csrfToken: 'a'.repeat(43),
});

const centsCandidate = Object.freeze({
  externalOrderId: '12345',
  orderCode: '00123',
  externalStoreId: '24',
  status: 'SUBMITTED',
  dueAt: '2026-07-10T20:00:00.000Z',
  sourceUpdatedAt: '2026-07-10T14:00:00.000Z',
  bagCount: null,
  totalAmountCents: 2_999,
  balanceDueCents: 2_499,
  services: [
    {
      externalServiceId: '43',
      name: 'Wash and Fold',
      category: 'LAUNDRY',
      quantity: 1,
      totalPriceCents: 2_999,
      unitPriceCents: 200,
    },
  ],
  customer: null,
});

const controlOrderDetail = Object.freeze({
  id: id(10),
  version: 2,
  displayNumber: 'P-100',
  state: 'open',
  dueAt: '2026-07-29T20:00:00.000Z',
  currency: 'USD',
  totalAmountCents: 3_000,
  balanceDueCents: 3_000,
  customer: {
    resolution: 'resolved',
    userId: id(11),
    displayName: 'Ada Lovelace',
    phone: '+12015550100',
    email: 'ada@example.com',
  },
  fulfillment: {
    id: id(12),
    version: 1,
    typeCode: 'wash_fold',
    locationId: 'east',
    releaseState: 'unreleased',
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'customer_estimate',
  },
  items: [
    {
      lineKey: 'wash-fold',
      itemType: 'service',
      code: 'WF',
      description: 'Wash and fold',
      quantity: 1,
      unit: 'order',
      unitPriceCents: 3_000,
      totalAmountCents: 3_000,
      sourceMetadata: { vendor: { serviceId: 43 }, labels: ['daily'] },
    },
  ],
  createdAt: '2026-07-29T12:00:00.000Z',
  updatedAt: '2026-07-29T12:00:00.000Z',
});

const fulfillmentDemand = Object.freeze({
  schemaVersion: 2,
  eventType: 'fulfillment_demand_changed',
  fulfillmentId: id(20),
  displayNumber: 'P-1001',
  locationId: 'east',
  typeCode: 'wash_fold',
  admissionState: 'released',
  commercialState: 'open',
  dueAt: '2026-07-22T20:00:00.000Z',
  estimatedWeightLbs: 42,
  estimatedWeightSource: 'source_estimate',
  version: 3,
  observedAt: '2026-07-21T20:00:00.000Z',
});

const webhookEvent = Object.freeze({
  source: 'cents',
  eventType: 'order.updated',
  deduplicationKey: 'a'.repeat(64),
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: '2026-07-12T14:00:00.000Z',
  payload: { order: { id: 'order-1' } },
  rawBodySha256: 'b'.repeat(64),
  disposition: 'process',
});

describe('custom serialized contract compatibility', () => {
  it('preserves Processor authentication refinements and strict wire data', () => {
    expectZodWireParity(
      'Processor authenticated session',
      processorAuthentication.processorAuthenticatedSessionSchema,
      [
        { name: 'valid session', serialized: processorSession },
        {
          name: 'no reusable credential',
          serialized: { ...processorSession, accessToken: 'secret' },
        },
        {
          name: 'origin-only application URL',
          serialized: {
            ...processorSession,
            access: {
              ...processorAccess,
              applications: [
                {
                  ...processorAccess.applications[0],
                  href: 'https://processor.trypressly.com/orders',
                },
              ],
            },
          },
        },
        {
          name: 'unique location capabilities',
          serialized: {
            ...processorSession,
            access: {
              ...processorAccess,
              locations: [
                {
                  ...processorAccess.locations[0],
                  capabilities: ['processor:view', 'processor:view'],
                },
              ],
            },
          },
        },
      ],
    );
  });

  it('preserves Cents aliases, passthrough data, and queued payload rules', () => {
    expectZodWireParity(
      'Cents webhook envelope',
      ingressCents.centsWebhookWireEnvelopeSchema,
      [
        {
          name: 'action alias with future data',
          serialized: {
            action: 'order_updated',
            order: { id: 123, storeId: 24 },
            vendorFutureField: { enabled: true },
          },
        },
        {
          name: 'event alias with future data',
          serialized: {
            event: 'customer_created',
            customer: { id: 815, future: 'value' },
          },
        },
        { name: 'missing alias', serialized: { order: {} } },
      ],
    );
    expectZodWireParity(
      'Cents submitted-order candidate',
      ingressCents.centsSubmittedOrderCandidatePayloadSchema,
      [
        { name: 'valid candidate', serialized: centsCandidate },
        {
          name: 'bag count remains explicitly absent',
          serialized: { ...centsCandidate, bagCount: 0 },
        },
        {
          name: 'no vendor aliases',
          serialized: {
            ...centsCandidate,
            dueDate: centsCandidate.dueAt,
          },
        },
        {
          name: 'only submitted status',
          serialized: { ...centsCandidate, status: 'PICKED_UP' },
        },
      ],
    );
  });

  it('preserves Control order-detail JSON wire semantics', () => {
    const cyclicMetadata: Record<string, unknown> = {};
    cyclicMetadata['self'] = cyclicMetadata;

    expectZodWireParity(
      'Control order detail',
      controlOrders.controlOrderDetailSchema,
      [
        { name: 'nested JSON metadata', serialized: controlOrderDetail },
        {
          name: 'Date is not JSON',
          serialized: {
            ...controlOrderDetail,
            items: [
              {
                ...controlOrderDetail.items[0],
                sourceMetadata: { observedAt: new Date() },
              },
            ],
          },
        },
        {
          name: 'undefined is not JSON',
          serialized: {
            ...controlOrderDetail,
            items: [
              {
                ...controlOrderDetail.items[0],
                sourceMetadata: { value: undefined },
              },
            ],
          },
        },
        {
          name: 'cyclic values are not JSON',
          serialized: {
            ...controlOrderDetail,
            items: [
              {
                ...controlOrderDetail.items[0],
                sourceMetadata: cyclicMetadata,
              },
            ],
          },
        },
      ],
    );
  });

  it('preserves Orders proposal and fulfillment-event refinements', () => {
    const proposalFixtures = [
      {
        name: 'valid proposal decision',
        serialized: {
          expectedVersion: 1,
          idempotencyKey: 'accept-proposal-001',
          reasonCode: 'incoming_order_accepted',
          reasonNote: null,
        },
      },
      {
        name: 'strict proposal decision',
        serialized: {
          expectedVersion: 1,
          idempotencyKey: 'accept-proposal-001',
          reasonCode: 'incoming_order_accepted',
          reasonNote: null,
          target: 'accepted',
        },
      },
    ];
    expectZodWireParity(
      'Accept incoming Order proposal',
      acceptIncomingOrderProposalHttpBodySchema,
      proposalFixtures,
    );
    expectZodWireParity(
      'Reject incoming Order proposal',
      rejectIncomingOrderProposalHttpBodySchema,
      [
        {
          name: 'known rejection reason',
          serialized: {
            expectedVersion: 1,
            idempotencyKey: 'reject-proposal-001',
            reasonCode: 'already_handled',
            reasonNote: null,
          },
        },
        {
          name: 'unknown rejection reason',
          serialized: {
            expectedVersion: 1,
            idempotencyKey: 'reject-proposal-001',
            reasonCode: 'other',
            reasonNote: null,
          },
        },
      ],
    );
    expectZodWireParity(
      'Restore incoming Order proposal',
      restoreIncomingOrderProposalHttpBodySchema,
      [
        {
          name: 'source-closure override',
          serialized: {
            expectedVersion: 2,
            idempotencyKey: 'restore-proposal-001',
            reasonCode: 'source_closure_overridden',
            reasonNote: 'Manager verified the physical work.',
          },
        },
        {
          name: 'wrong restoration reason',
          serialized: {
            expectedVersion: 2,
            idempotencyKey: 'restore-proposal-001',
            reasonCode: 'manager_override',
            reasonNote: null,
          },
        },
      ],
    );
    const fulfillmentFixtures = [
      { name: 'versioned event', serialized: fulfillmentDemand },
      {
        name: 'unknown version',
        serialized: { ...fulfillmentDemand, schemaVersion: 1 },
      },
      {
        name: 'retired external bag evidence',
        serialized: { ...fulfillmentDemand, bagCount: 2 },
      },
      {
        name: 'incoherent weight provenance',
        serialized: { ...fulfillmentDemand, estimatedWeightSource: null },
      },
    ];
    expectZodWireParity(
      'Fulfillment demand event',
      fulfillmentDemandChangedV2PayloadSchema,
      fulfillmentFixtures,
    );
    expectBoundaryWireParity(
      'Fulfillment demand message payload',
      fulfillmentDemandChangedV2MessageContract.payload,
      fulfillmentFixtures,
    );
  });

  it('preserves source-neutral webhook refinements and serialized dates', () => {
    expectZodWireParity(
      'Webhook ingest command',
      ingressWebhook.ingestWebhookEventCommandSchema,
      [
        { name: 'processable event', serialized: webhookEvent },
        {
          name: 'processable event requires payload',
          serialized: { ...webhookEvent, payload: null },
        },
        {
          name: 'ignored event permits null payload',
          serialized: {
            ...webhookEvent,
            subjectType: 'customer',
            payload: null,
            disposition: 'ignore',
          },
        },
        {
          name: 'hash identity is exact',
          serialized: { ...webhookEvent, deduplicationKey: 'delivery-1' },
        },
        {
          name: 'command is strict',
          serialized: { ...webhookEvent, vendor: 'cents' },
        },
      ],
    );

    const binding = {
      source: 'cents',
      externalLocationId: 'store-1',
      locationId: 'location-1',
      isActive: true,
    };
    expectZodWireParity(
      'Webhook source-location manifest',
      ingressWebhook.sourceLocationBindingsManifestSchema,
      [
        {
          name: 'unique binding',
          serialized: { sourceLocationBindings: [binding] },
        },
        {
          name: 'duplicate binding',
          serialized: { sourceLocationBindings: [binding, binding] },
        },
        {
          name: 'empty manifest',
          serialized: { sourceLocationBindings: [] },
        },
      ],
    );
  });

  it('preserves Pricing wire results at owner and Control boundaries', () => {
    const catalog = {
      serviceSlug: 'wash-fold',
      currency: 'USD',
      updatedAt: '2026-08-02T12:00:00.000Z',
      items: [],
    };
    expectZodWireParity(
      'Pricing catalog HTTP result',
      pricingCatalogHttpResultSchema,
      [
        { name: 'serialized catalog', serialized: catalog },
        {
          name: 'timestamp is not a Date',
          serialized: { ...catalog, updatedAt: new Date(catalog.updatedAt) },
        },
        {
          name: 'legacy string timestamp semantics',
          serialized: { ...catalog, updatedAt: 'owner-defined-version' },
        },
        {
          name: 'default item metadata',
          serialized: {
            ...catalog,
            items: [
              {
                service: 'wash-fold',
                unit: 'lb',
                category: 'laundry',
                name: 'Wash and Fold',
                priceCents: 250,
                sortOrder: 1,
              },
            ],
          },
        },
      ],
    );
    expectZodWireParity('Control pricing plan', controlCli.pricingPlanSchema, [
      {
        name: 'strict plan',
        serialized: {
          serviceSlug: 'dry-cleaning',
          reason: 'Update garment pricing',
          oldPricingSetId: 'set-1',
          currency: 'USD',
          changes: [
            {
              code: 'shirt',
              name: 'Shirt',
              oldPriceCents: 495,
              newPriceCents: 595,
            },
          ],
        },
      },
    ]);
    expectZodWireParity(
      'Control pricing publish result',
      controlCli.pricingPublishResultSchema,
      [
        {
          name: 'valid publish result',
          serialized: {
            oldPricingSetId: 'set-1',
            newPricingSetId: 'set-2',
            auditEventId: 'event-1',
            changeItemCount: 1,
          },
        },
        {
          name: 'nonnegative item count',
          serialized: {
            oldPricingSetId: 'set-1',
            newPricingSetId: 'set-2',
            auditEventId: 'event-1',
            changeItemCount: -1,
          },
        },
      ],
    );
  });

  it('preserves Processor operational identity and history refinements', () => {
    expectZodWireParity(
      'Processor operational identity',
      processorOperationalOrder.processorOperationalOrderIdentitySchema,
      [
        {
          name: 'canonical identity',
          serialized: {
            displayNumber: 'ORD-2048',
            customerDisplayName: 'Northwind Hotel',
          },
        },
        {
          name: 'identity is strict',
          serialized: {
            displayNumber: 'ORD-2048',
            customerDisplayName: 'Northwind Hotel',
            phone: '+12015550101',
          },
        },
      ],
    );

    const orderActivity = {
      id: id(30),
      eventType: 'production_order_resolved_without_production',
      entityType: 'production_order',
      entityId: id(31),
      actor: { id: id(32), kind: 'user', displayName: 'Manager' },
      expectedVersion: 2,
      productionRunId: null,
      resolutionAction: { action: 'restore', expectedVersion: 2 },
      summary: 'Order archived from active work.',
      details: {
        kind: 'order',
        productionRunId: null,
        sourceBatchId: null,
        targetBatchId: null,
        outcome: 'resolved_without_production',
        bagCount: null,
        priority: null,
        queueVersion: null,
        version: 2,
        resolutionState: 'resolved_without_production',
        resolutionReason: 'processor_not_in_use',
        routeReason: null,
        restartStage: null,
        releasedStages: [],
        assignedStages: [],
      },
      occurredAt: '2026-07-27T12:00:00.000Z',
      identity: {
        displayNumber: 'ORD-2053',
        customerDisplayName: 'Camila Reed',
      },
    };
    expectZodWireParity(
      'Processor history activity identity',
      processorHistory.processorProductionHistoryActivityEntrySchema,
      [
        { name: 'Production order has identity', serialized: orderActivity },
        {
          name: 'Production order cannot omit identity',
          serialized: { ...orderActivity, identity: null },
        },
        {
          name: 'non-Order activity cannot claim identity',
          serialized: {
            ...orderActivity,
            eventType: 'scheduler_config_published',
            entityType: 'scheduler_config',
            details: { kind: 'configuration', version: 1 },
          },
        },
      ],
    );
  });

  it('preserves Production cross-field refinements from every focused suite', () => {
    expectZodWireParity(
      'Production service day',
      loadRemainingDayForecast.productionServiceDaySchema,
      [
        { name: 'leap day', serialized: '2024-02-29' },
        { name: 'nonexistent leap day', serialized: '2026-02-29' },
        { name: 'invalid month', serialized: '2026-13-01' },
      ],
    );

    const backlogCommand = {
      locationId: 'location-main',
      filter: 'all_due_before_cutoff',
      cutoff: '2026-07-01T00:00:00.000Z',
      reason: 'other',
      previewHash: 'a'.repeat(64),
      idempotencyKey: 'bulk-resolution-other',
    };
    expectZodWireParity(
      'Production backlog commit',
      productionOrderBacklog.commitProductionOrderBacklogCommandSchema,
      [
        { name: 'other requires note', serialized: backlogCommand },
        {
          name: 'other with note',
          serialized: {
            ...backlogCommand,
            note: 'The manager documented the exceptional cleanup.',
          },
        },
      ],
    );

    const historyRun = {
      productionRunId: id(40),
      productionShiftId: id(41),
      scheduleRunId: id(42),
      status: 'completed',
      shiftStartsAt: '2026-07-15T12:00:00.000Z',
      shiftEndsAt: '2026-07-15T20:00:00.000Z',
      timezone: 'America/New_York',
      startedAt: '2026-07-15T12:00:00.000Z',
      completedAt: '2026-07-15T19:00:00.000Z',
      plannedCompletionAt: '2026-07-15T18:30:00.000Z',
      batchCount: 4,
      completedBatchCount: 4,
      orderCount: 15,
      priorityOrderCount: 2,
      totalWeightLbs: 800,
      queueVersion: 3,
      overtimeAcknowledged: false,
      createdAt: '2026-07-15T11:50:00.000Z',
    };
    expectZodWireParity(
      'Production history aggregates',
      productionHistory.productionHistoryRunSummarySchema,
      [
        { name: 'honest aggregate', serialized: historyRun },
        {
          name: 'completed batches cannot exceed total',
          serialized: { ...historyRun, completedBatchCount: 5 },
        },
      ],
    );

    const routeTarget = {
      productionBatchId: id(50),
      batchSequence: 2,
      batchStatus: 'queued',
      membershipFrozen: false,
      expectedBatchVersion: 8,
      currentWeightLbs: 60,
      projectedWeightLbs: 90,
      capacityLbs: 100,
      feasibility: { status: 'allowed' },
    };
    const capabilities = {
      queuedMove: {
        status: 'allowed',
        expectedQueueVersion: 5,
        expectedOrderVersion: 6,
        expectedSourceBatchVersion: 7,
        targets: [routeTarget],
      },
      routeException: {
        status: 'blocked',
        code: 'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
      },
    };
    expectZodWireParity(
      'Production Order command capabilities',
      productionOrderControl.productionOrderCommandCapabilitiesSchema,
      [
        { name: 'structured capability', serialized: capabilities },
        {
          name: 'allowed target must be feasible',
          serialized: {
            ...capabilities,
            queuedMove: {
              ...capabilities.queuedMove,
              targets: [
                {
                  ...routeTarget,
                  feasibility: {
                    status: 'blocked',
                    code: 'HARD_CAPACITY_EXCEEDED',
                  },
                },
              ],
            },
          },
        },
      ],
    );

    const resolution = {
      action: 'resolve_without_production',
      reason: 'other',
      note: null,
      confirmReviewedFacts: false,
      expectedVersion: 4,
      idempotencyKey: 'resolution-other',
    };
    expectZodWireParity(
      'Production Order resolution',
      changeOrderResolution.changeProductionOrderResolutionRequestSchema,
      [
        { name: 'other requires a note', serialized: resolution },
        {
          name: 'other has a note',
          serialized: {
            ...resolution,
            note: 'Manager explained the exceptional resolution.',
          },
        },
      ],
    );

    const shiftUpdate = {
      startsAt: '2026-07-15T12:00:00.000Z',
      endsAt: '2026-07-15T21:00:00.000Z',
      effectiveFolderCount: 4,
      expectedVersion: 2,
      idempotencyKey: 'shift-update-1',
    };
    expectZodWireParity(
      'Production shift update',
      updateShift.updateProductionShiftRequestSchema,
      [
        { name: 'valid update', serialized: shiftUpdate },
        {
          name: 'reversed shift window',
          serialized: {
            ...shiftUpdate,
            startsAt: shiftUpdate.endsAt,
            endsAt: shiftUpdate.startsAt,
          },
        },
      ],
    );
  });
});
