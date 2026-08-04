export {
  commitProductionOrderRouteRequestSchema,
  commitProductionOrderRouteResultSchema,
  previewProductionOrderRouteRequestSchema,
  productionOrderRouteProposalSchema,
  productionOrderRoutingParamsSchema,
} from '@pressly/contracts/production';
import type {
  CommitProductionOrderRouteRequest,
  CommitProductionOrderRouteResult as CommitProductionOrderRouteWireResult,
  PreviewProductionOrderRouteRequest,
  ProductionOrderRouteProposal as ProductionOrderRouteWireProposal,
} from '@pressly/contracts/production';
import type {
  CommitProductionOrderRouteCommand,
  CommitProductionOrderRouteResult,
  PreviewProductionOrderRouteCommand,
  ProductionOrderRouteProposal,
} from './route-production-order.model.ts';

type RoutingIdentity = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
  actorId: string;
}>;

const toRoutingIdentity = (identity: RoutingIdentity) => ({
  ...identity,
  authorizedAction: 'production:stage' as const,
});

export const toPreviewProductionOrderRouteCommand = (
  identity: RoutingIdentity,
  request: PreviewProductionOrderRouteRequest,
): PreviewProductionOrderRouteCommand =>
  request.kind === 'queued_move'
    ? {
        ...toRoutingIdentity(identity),
        kind: request.kind,
        reason: request.reason,
        targetProductionBatchId: request.targetProductionBatchId,
        restartStage: request.restartStage,
        expectedQueueVersion: request.expectedQueueVersion,
        expectedOrderVersion: request.expectedOrderVersion,
        expectedSourceBatchVersion: request.expectedSourceBatchVersion,
      }
    : {
        ...toRoutingIdentity(identity),
        kind: request.kind,
        reason: request.reason,
        restartStage: request.restartStage,
        ...(request.note === undefined ? {} : { note: request.note }),
        expectedQueueVersion: request.expectedQueueVersion,
        expectedOrderVersion: request.expectedOrderVersion,
        expectedSourceBatchVersion: request.expectedSourceBatchVersion,
      };

export const toCommitProductionOrderRouteCommand = (
  identity: RoutingIdentity,
  request: CommitProductionOrderRouteRequest,
): CommitProductionOrderRouteCommand => ({
  ...toPreviewProductionOrderRouteCommand(identity, request),
  proposalHash: request.proposalHash,
  idempotencyKey: request.idempotencyKey,
});

export const toProductionOrderRouteProposal = (
  proposal: ProductionOrderRouteProposal,
): ProductionOrderRouteWireProposal => ({
  ...proposal,
  releasedStages: [...proposal.releasedStages],
  assignedStages: [...proposal.assignedStages],
});

export const toCommitProductionOrderRouteResult = (
  outcome: CommitProductionOrderRouteResult,
): CommitProductionOrderRouteWireResult => ({
  ...outcome,
  proposal: toProductionOrderRouteProposal(outcome.proposal),
  createdAttemptIds: [...outcome.createdAttemptIds],
});
