import type {
  ProductionOrderCommandCapabilities,
  ProductionOrderRouteCommandDenialCode,
  ProductionQueuedMoveTarget,
} from '@pressly/contracts';
import type {
  OrderRoutingPolicyInput,
  OrderRoutingStage,
} from '../production-policy/order-routing-policy.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';

type RoutingBatch = OrderRoutingPolicyInput['targetCandidates'][number] &
  Readonly<{
    version: number;
    derivedWeightLbs: number;
    pulseCapacityLbs: number;
  }>;

export type ProductionOrderCommandCapabilityContext = Readonly<{
  order: Readonly<{
    id: string;
    operationalStatus: string;
    executionStatus: string;
    resolutionState: string;
    version: number;
    weightLbs: number;
  }>;
  run: Readonly<{
    id: string;
    status: string;
    queueVersion: number;
  }> | null;
  source:
    | (RoutingBatch &
        Readonly<{
          activeOrderCount: number;
        }>)
    | null;
  candidates: readonly RoutingBatch[];
}>;

const blocked = (
  code: ProductionOrderRouteCommandDenialCode,
): Readonly<{
  status: 'blocked';
  code: ProductionOrderRouteCommandDenialCode;
}> => ({ status: 'blocked', code });

const commonDenial = (
  policy: ProductionPolicyPort,
  context: ProductionOrderCommandCapabilityContext,
): ProductionOrderRouteCommandDenialCode | null => {
  if (context.run === null || context.source === null)
    return 'PRODUCTION_ORDER_ROUTE_NOT_FOUND';
  if (context.run.status !== 'started') return 'PRODUCTION_RUN_NOT_STARTED';

  const access = policy.evaluateProductionOrderOperationalAccess({
    resolutionState: context.order.resolutionState,
  });
  if (access.tag === 'err')
    return access.error.code === 'PRODUCTION_ORDER_RESOLVED'
      ? 'PRODUCTION_ORDER_RESOLVED'
      : 'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID';

  const execution = policy.resolveProductionOrderExecutionState({
    executionState: context.order.executionStatus,
    operationalStatus: context.order.operationalStatus,
  });
  if (execution.tag === 'err')
    return 'PRODUCTION_ORDER_EXECUTION_STATE_INVALID';
  if (execution.value !== 'scheduled') return 'PRODUCTION_ORDER_NOT_SCHEDULED';
  if (context.source.activeOrderCount <= 1)
    return 'SOURCE_BATCH_WOULD_BE_EMPTY';
  if (!Number.isFinite(context.order.weightLbs) || context.order.weightLbs <= 0)
    return 'ORDER_WEIGHT_INVALID';
  if (
    context.source.productionBatchId.length === 0 ||
    !Number.isInteger(context.source.sequence) ||
    context.source.sequence < 0
  )
    return 'SOURCE_BATCH_INVALID';
  return null;
};

const queuedTarget = (
  policy: ProductionPolicyPort,
  context: ProductionOrderCommandCapabilityContext,
  candidate: RoutingBatch,
): ProductionQueuedMoveTarget => {
  if (context.source === null)
    throw new Error('Queued target evaluation requires a source batch.');
  const decision = policy.evaluateQueuedMoveTarget({
    sourceProductionBatchId: context.source.productionBatchId,
    orderWeightLbs: context.order.weightLbs,
    target: candidate,
  });
  return {
    productionBatchId: candidate.productionBatchId,
    batchSequence: candidate.sequence,
    batchStatus: candidate.status,
    membershipFrozen: candidate.membershipFrozen,
    expectedBatchVersion: candidate.version,
    currentWeightLbs: candidate.derivedWeightLbs,
    projectedWeightLbs: candidate.derivedWeightLbs + context.order.weightLbs,
    capacityLbs: candidate.pulseCapacityLbs,
    feasibility:
      decision.decision === 'allowed'
        ? { status: 'allowed' }
        : { status: 'blocked', code: decision.code },
  };
};

const currentStage = (
  source: NonNullable<ProductionOrderCommandCapabilityContext['source']>,
): OrderRoutingStage =>
  source.status === 'sorting' ||
  source.status === 'washing' ||
  source.status === 'drying' ||
  source.status === 'folding_packaging'
    ? source.status
    : 'sorting';

const routeExceptionCapability = (
  policy: ProductionPolicyPort,
  context: ProductionOrderCommandCapabilityContext,
  source: NonNullable<ProductionOrderCommandCapabilityContext['source']>,
  versions: Readonly<{
    expectedQueueVersion: number;
    expectedOrderVersion: number;
    expectedSourceBatchVersion: number;
  }>,
): ProductionOrderCommandCapabilities['routeException'] => {
  if (source.status === 'queued' || source.status === 'finished')
    return blocked('EXCEPTION_SOURCE_NOT_IN_FLIGHT');

  const stage = currentStage(source);
  const decision = policy.evaluateOrderRouting({
    command: 'defer_or_rework',
    order: {
      productionOrderId: context.order.id,
      weightLbs: context.order.weightLbs,
    },
    source: {
      productionBatchId: source.productionBatchId,
      sequence: source.sequence,
      status: source.status,
      membershipFrozen: source.membershipFrozen,
    },
    currentStage: stage,
    restartStage: stage,
    targetCandidates: context.candidates,
  });
  return decision.decision === 'accepted'
    ? { status: 'allowed', ...versions }
    : blocked(decision.reason.code);
};

export const assessProductionOrderCommandCapabilities = (
  policy: ProductionPolicyPort,
  context: ProductionOrderCommandCapabilityContext,
): ProductionOrderCommandCapabilities => {
  const targets =
    context.source === null
      ? []
      : context.candidates.map((candidate) =>
          queuedTarget(policy, context, candidate),
        );
  const denial = commonDenial(policy, context);
  if (denial !== null)
    return {
      queuedMove: { ...blocked(denial), targets },
      routeException: blocked(denial),
    };

  const run = context.run!;
  const source = context.source!;
  const versions = {
    expectedQueueVersion: run.queueVersion,
    expectedOrderVersion: context.order.version,
    expectedSourceBatchVersion: source.version,
  } as const;

  const queuedMove =
    source.status !== 'queued'
      ? {
          ...blocked('QUEUED_REBATCH_SOURCE_NOT_QUEUED'),
          targets,
        }
      : source.membershipFrozen
        ? {
            ...blocked('QUEUED_REBATCH_SOURCE_FROZEN'),
            targets,
          }
        : targets.some((target) => target.feasibility.status === 'allowed')
          ? { status: 'allowed' as const, ...versions, targets }
          : { ...blocked('NO_FEASIBLE_TARGET'), targets };

  const routeException = routeExceptionCapability(
    policy,
    context,
    source,
    versions,
  );

  return { queuedMove, routeException };
};
