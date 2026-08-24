import { evaluateOrderRouteProposal } from '../../../model/order-route-proposal/evaluate.ts';
import type {
  OrderRouteProposalCommand,
  OrderRouteProposalContext,
  OrderRouteProposalDecision,
  OrderRouteProposalPolicy,
} from '../../../model/order-route-proposal/model.ts';

/** Preview specializes the shared evaluator to an unlocked snapshot. */
export const decidePreviewOrderRoute = (input: {
  command: OrderRouteProposalCommand;
  context: OrderRouteProposalContext;
  policy: OrderRouteProposalPolicy;
}): OrderRouteProposalDecision =>
  evaluateOrderRouteProposal({ ...input, consistency: 'snapshot' });
