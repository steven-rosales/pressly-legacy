import type {
  ListProcessorOrderControlResult,
  ProcessorOrderContext,
} from '@pressly/contracts/processor';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  OperationalOrderContext,
  OperationalOrderContextResolution,
  OperationalOrderIdentity,
} from '@pressly/processor-experience';
import type { ListProductionOrderControlResult } from '@pressly/production';

const toContractContext = (
  context: OperationalOrderContext | null,
): ProcessorOrderContext | null =>
  context === null
    ? null
    : {
        ...context,
        customer: { ...context.customer },
        versions: { ...context.versions },
        source: context.source === null ? null : { ...context.source },
        audit: context.audit.map((entry) => ({ ...entry })),
      };

const serializeOrderControlItem = (
  item: ListProductionOrderControlResult['items'][number],
  identity: OperationalOrderIdentity,
  canonical: OperationalOrderContext | null,
): ListProcessorOrderControlResult['items'][number] => ({
  order: {
    ...item.order,
    dueAt: item.order.dueAt.toISOString(),
  },
  admission: {
    ...item.admission,
    allowedActions: [...item.admission.allowedActions],
  },
  attention: item.attention === null ? null : { ...item.attention },
  currentPlacement:
    item.currentPlacement === null
      ? null
      : {
          ...item.currentPlacement,
          pinnedAt: item.currentPlacement.pinnedAt?.toISOString() ?? null,
        },
  nextRequiredStage: item.nextRequiredStage,
  routeAttempts: item.routeAttempts.map((attempt) => ({
    ...attempt,
    assignedAt: attempt.assignedAt.toISOString(),
    completedAt: attempt.completedAt?.toISOString() ?? null,
    releasedAt: attempt.releasedAt?.toISOString() ?? null,
  })),
  commands: {
    queuedMove: {
      ...item.commands.queuedMove,
      targets: item.commands.queuedMove.targets.map((target) => ({
        ...target,
        feasibility: { ...target.feasibility },
      })),
    },
    routeException: { ...item.commands.routeException },
  },
  resolutionAction:
    item.resolutionAction.status === 'allowed'
      ? {
          ...item.resolutionAction,
          reviewReasons: [...item.resolutionAction.reviewReasons],
        }
      : {
          ...item.resolutionAction,
          reasons: [...item.resolutionAction.reasons],
        },
  identity: { ...identity },
  canonical: toContractContext(canonical),
});

export const toProcessorOrderControlContract = (
  base: ListProductionOrderControlResult,
  contexts: ReadonlyMap<string, OperationalOrderContextResolution>,
): ListProcessorOrderControlResult => ({
  items: base.items.map((item) => {
    const resolved = contexts.get(item.order.id);
    if (resolved === undefined)
      throw invariantViolationError({
        code: 'processor_order_context_unresolved',
        message: `Processor order context was not resolved for ${item.order.id}.`,
      });
    return serializeOrderControlItem(
      item,
      resolved.identity,
      resolved.canonical,
    );
  }),
  counts: { ...base.counts },
  nextCursor: base.nextCursor,
  asOf: base.asOf.toISOString(),
});
