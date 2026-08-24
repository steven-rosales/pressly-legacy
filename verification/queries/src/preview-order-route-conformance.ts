import type { OrderRouteProposalCommand } from '@pressly/production-system/models/order-route-proposal';

const uuid = (suffix: number): string =>
  `70000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const previewOrderRouteConformanceLocationId =
  'preview-route-conformance';

export const previewOrderRouteConformanceIds = Object.freeze({
  business: uuid(1),
  actor: uuid(2),
  shift: uuid(3),
  schedulerConfig: uuid(4),
  scheduleRun: uuid(5),
  productionRun: uuid(6),
  sourceBatch: uuid(7),
  earlyTargetBatch: uuid(8),
  lateTargetBatch: uuid(9),
  sourceOrder: uuid(10),
  sourceAnchorOrder: uuid(11),
  earlyTargetOrder: uuid(12),
  lateTargetOrder: uuid(13),
  externalOrders: Object.freeze([
    uuid(20),
    uuid(21),
    uuid(22),
    uuid(23),
  ] as const),
  fulfillments: Object.freeze([
    uuid(30),
    uuid(31),
    uuid(32),
    uuid(33),
  ] as const),
  demands: Object.freeze([uuid(40), uuid(41), uuid(42), uuid(43)] as const),
  stations: Object.freeze({
    sorting: uuid(50),
    washing: uuid(51),
    drying: uuid(52),
    folding_packaging: uuid(53),
  }),
  washer: uuid(54),
  dryer: uuid(55),
  sourceStages: Object.freeze({
    sorting: uuid(60),
    washing: uuid(61),
    drying: uuid(62),
    folding_packaging: uuid(63),
  }),
  earlyTargetStages: Object.freeze({
    sorting: uuid(70),
    washing: uuid(71),
    drying: uuid(72),
    folding_packaging: uuid(73),
  }),
  lateTargetStages: Object.freeze({
    sorting: uuid(80),
    washing: uuid(81),
    drying: uuid(82),
    folding_packaging: uuid(83),
  }),
});

export type PreviewOrderRouteFixture =
  | 'queued'
  | 'exception'
  | 'hard-capacity'
  | 'invalid-target-graph';

export type PreviewOrderRouteTraceEvent =
  | Readonly<{ kind: 'read' }>
  | Readonly<{ kind: 'clock' }>
  | Readonly<{
      kind: 'route-outcome';
      status:
        | 'proposed'
        | 'committed'
        | 'replayed'
        | 'rejected'
        | 'conflict'
        | 'failed';
    }>
  | Readonly<{ kind: 'queue-conflict'; operation: string }>
  | Readonly<{ kind: 'settled' }>;

export type CanonicalPreviewOrderRouteFailure = Readonly<{
  kind: string;
  classification: string | null;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalPreviewOrderRouteOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{
      kind: 'failure';
      failure: CanonicalPreviewOrderRouteFailure;
    }>
  | Readonly<{
      kind: 'unexpected';
      error: CanonicalPreviewOrderRouteFailure;
    }>;

export type PreviewOrderRouteConformanceScenario = Readonly<{
  name: string;
  fixture: PreviewOrderRouteFixture;
  request: OrderRouteProposalCommand;
  expectedCode?: string;
  expectedCanonicalBytes?: string;
}>;

const commonRequest = Object.freeze({
  locationId: previewOrderRouteConformanceLocationId,
  productionRunId: previewOrderRouteConformanceIds.productionRun,
  productionOrderId: previewOrderRouteConformanceIds.sourceOrder,
  actorId: previewOrderRouteConformanceIds.actor,
  authorizedAction: 'production:stage' as const,
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
});

const queuedRequest: OrderRouteProposalCommand = Object.freeze({
  ...commonRequest,
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: previewOrderRouteConformanceIds.lateTargetBatch,
  restartStage: 'sorting',
});

const exceptionRequest: OrderRouteProposalCommand = Object.freeze({
  ...commonRequest,
  kind: 'exception',
  reason: 'rewash_required',
  restartStage: 'washing',
});

const queuedCanonicalBytes = JSON.stringify({
  kind: 'queued_move',
  productionRunId: previewOrderRouteConformanceIds.productionRun,
  productionOrderId: previewOrderRouteConformanceIds.sourceOrder,
  sourceProductionBatchId: previewOrderRouteConformanceIds.sourceBatch,
  sourceBatchSequence: 0,
  targetProductionBatchId: previewOrderRouteConformanceIds.lateTargetBatch,
  targetBatchSequence: 2,
  restartStage: 'sorting',
  releasedStages: ['sorting', 'washing', 'drying', 'folding_packaging'],
  assignedStages: ['sorting', 'washing', 'drying', 'folding_packaging'],
  orderWeightLbs: 20,
  targetWeightLbs: 60,
  targetCapacityLbs: 100,
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
  expectedTargetBatchVersion: 6,
});

const exceptionCanonicalBytes = JSON.stringify({
  kind: 'exception',
  productionRunId: previewOrderRouteConformanceIds.productionRun,
  productionOrderId: previewOrderRouteConformanceIds.sourceOrder,
  sourceProductionBatchId: previewOrderRouteConformanceIds.sourceBatch,
  sourceBatchSequence: 0,
  targetProductionBatchId: previewOrderRouteConformanceIds.earlyTargetBatch,
  targetBatchSequence: 1,
  restartStage: 'washing',
  releasedStages: ['washing', 'drying', 'folding_packaging'],
  assignedStages: ['washing', 'drying', 'folding_packaging'],
  orderWeightLbs: 20,
  targetWeightLbs: 50,
  targetCapacityLbs: 100,
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
  expectedTargetBatchVersion: 5,
});

export const previewOrderRouteConformanceScenarios: readonly PreviewOrderRouteConformanceScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'queued success preserves the selected target and canonical bytes',
      fixture: 'queued' as const,
      request: queuedRequest,
      expectedCanonicalBytes: queuedCanonicalBytes,
    }),
    Object.freeze({
      name: 'exception success chooses the earliest ordered feasible target',
      fixture: 'exception' as const,
      request: exceptionRequest,
      expectedCanonicalBytes: exceptionCanonicalBytes,
    }),
    Object.freeze({
      name: 'stale queue versions conflict before a proposal is emitted',
      fixture: 'queued' as const,
      request: Object.freeze({ ...queuedRequest, expectedQueueVersion: 3 }),
      expectedCode: 'production_queue_version_conflict',
    }),
    Object.freeze({
      name: 'hard target capacity is a semantic policy rejection',
      fixture: 'hard-capacity' as const,
      request: Object.freeze({
        ...queuedRequest,
        targetProductionBatchId:
          previewOrderRouteConformanceIds.earlyTargetBatch,
      }),
      expectedCode: 'hard_capacity_exceeded',
    }),
    Object.freeze({
      name: 'missing active machine capacity invalidates the target stage graph',
      fixture: 'invalid-target-graph' as const,
      request: Object.freeze({
        ...queuedRequest,
        targetProductionBatchId:
          previewOrderRouteConformanceIds.earlyTargetBatch,
      }),
      expectedCode: 'target_stage_graph_invalid',
    }),
  ]);

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const nullableString = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
): string | null => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : null;
};

const canonicalFailure = (
  value: unknown,
): CanonicalPreviewOrderRouteFailure => {
  const fields = record(value);
  return Object.freeze({
    kind: nullableString(fields, 'kind') ?? 'unknown',
    classification: nullableString(fields, 'classification'),
    code: nullableString(fields, 'code') ?? 'unknown_error',
    message:
      value instanceof Error
        ? value.message
        : (nullableString(fields, 'message') ?? 'Unknown error.'),
    safeMessage: nullableString(fields, 'safeMessage'),
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  });
};

export const capturePreviewOrderRouteOutcome = async (
  execute: (input: OrderRouteProposalCommand) => Promise<unknown>,
  input: OrderRouteProposalCommand,
): Promise<CanonicalPreviewOrderRouteOutcome> => {
  try {
    const raw = await execute(input);
    const carrier = record(raw);
    if (carrier?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['error']),
      });
    if (carrier?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['failure']),
      });

    const value =
      carrier?.['tag'] === 'ok' || carrier?.['kind'] === 'success'
        ? carrier['value']
        : raw;
    return Object.freeze({ kind: 'success', value });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

export type PreviewOrderRouteConformanceVariant = Readonly<{
  execute: (input: OrderRouteProposalCommand) => Promise<unknown>;
  trace: () => readonly PreviewOrderRouteTraceEvent[];
}>;

export type PreviewOrderRouteConformanceObservation<State> = Readonly<{
  target: CanonicalPreviewOrderRouteOutcome;
  state: Readonly<{
    before: State;
    afterTarget: State;
  }>;
  trace: readonly PreviewOrderRouteTraceEvent[];
}>;

export const runPreviewOrderRouteConformanceScenario = async <State>(input: {
  scenario: PreviewOrderRouteConformanceScenario;
  reset: () => Promise<void>;
  seed: (fixture: PreviewOrderRouteFixture) => Promise<void>;
  readState: () => Promise<State>;
  makeTarget: () => PreviewOrderRouteConformanceVariant;
}): Promise<PreviewOrderRouteConformanceObservation<State>> => {
  await input.reset();
  await input.seed(input.scenario.fixture);
  const before = await input.readState();

  const targetVariant = input.makeTarget();
  const target = await capturePreviewOrderRouteOutcome(
    targetVariant.execute,
    input.scenario.request,
  );
  const afterTarget = await input.readState();

  return Object.freeze({
    target,
    state: Object.freeze({ before, afterTarget }),
    trace: Object.freeze([...targetVariant.trace()]),
  });
};
