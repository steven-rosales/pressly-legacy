import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type {
  OrderRouteProposalCommand,
  OrderRouteProposalDecision,
  OrderRouteProposalPolicy,
  ProductionOrderRouteProposal,
} from '../../../model/order-route-proposal/model.ts';
import { decidePreviewOrderRoute } from './decide.ts';
import { previewOrderRouteNotFound } from './failures.ts';
import type {
  PreviewOrderRouteExpectedFailure,
  PreviewOrderRouteRepository,
  PreviewOrderRouteSignals,
} from './types.ts';

export type PreviewOrderRouteDependencies = Readonly<{
  repo: PreviewOrderRouteRepository;
  policy: OrderRouteProposalPolicy;
  signals?: PreviewOrderRouteSignals;
}>;

export type ExecutePreviewOrderRoute = (
  command: OrderRouteProposalCommand,
) => Promise<
  CellOutcome<ProductionOrderRouteProposal, PreviewOrderRouteExpectedFailure>
>;

const success = (
  value: ProductionOrderRouteProposal,
): CellOutcome<
  ProductionOrderRouteProposal,
  PreviewOrderRouteExpectedFailure
> => ({
  kind: 'success',
  value,
});

const failure = (
  value: PreviewOrderRouteExpectedFailure,
): CellOutcome<
  ProductionOrderRouteProposal,
  PreviewOrderRouteExpectedFailure
> => ({
  kind: 'failure',
  failure: value,
});

const reportOutcome = (
  signals: PreviewOrderRouteSignals | undefined,
  command: OrderRouteProposalCommand,
  status: 'proposed' | 'rejected' | 'conflict' | 'failed',
): void => {
  signals?.orderRouteOutcome({
    operation: 'preview',
    status,
    kind: command.kind,
    reason: command.reason,
  });
};

const reportDecision = (
  signals: PreviewOrderRouteSignals | undefined,
  command: OrderRouteProposalCommand,
  decision:
    | OrderRouteProposalDecision
    | Readonly<{
        kind: 'reject';
        failure: ReturnType<typeof previewOrderRouteNotFound>;
      }>,
): void => {
  if (decision.kind === 'propose') {
    reportOutcome(signals, command, 'proposed');
    return;
  }

  reportOutcome(
    signals,
    command,
    decision.failure.kind === 'conflict' ? 'conflict' : 'rejected',
  );
  if (decision.failure.code === 'production_queue_version_conflict')
    signals?.queueConflict({ operation: 'order_route_preview' });
};

export const makeExecutePreviewOrderRoute =
  (dependencies: PreviewOrderRouteDependencies): ExecutePreviewOrderRoute =>
  async (command) => {
    let context;
    try {
      context = await dependencies.repo.load({
        locationId: command.locationId,
        productionRunId: command.productionRunId,
        productionOrderId: command.productionOrderId,
      });
    } catch (error) {
      reportOutcome(dependencies.signals, command, 'failed');
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_route_preview_failed',
          message: 'The production order route could not be previewed.',
          safeMessage: 'The production order route could not be previewed.',
          status: 503,
          cause,
        }),
      );
    }

    let decision:
      | OrderRouteProposalDecision
      | Readonly<{
          kind: 'reject';
          failure: ReturnType<typeof previewOrderRouteNotFound>;
        }>;
    try {
      decision =
        context === null
          ? { kind: 'reject', failure: previewOrderRouteNotFound() }
          : decidePreviewOrderRoute({
              command,
              context,
              policy: dependencies.policy,
            });
    } catch (error) {
      reportOutcome(dependencies.signals, command, 'failed');
      throw mapUnknownError(error, (cause) =>
        invariantViolationError({
          code: 'production_order_route_evaluation_failed',
          message: 'The production order route could not be evaluated safely.',
          safeMessage:
            'The production order route could not be evaluated safely.',
          cause,
        }),
      );
    }

    reportDecision(dependencies.signals, command, decision);
    return decision.kind === 'propose'
      ? success(decision.proposal)
      : failure(decision.failure);
  };
