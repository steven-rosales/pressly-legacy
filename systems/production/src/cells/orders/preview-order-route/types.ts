import type { ProductionOrderRouteReason } from '../../../model/execution.ts';
import type {
  OrderRouteProposalCommand,
  OrderRouteProposalContext,
  OrderRouteProposalFailure,
} from '../../../model/order-route-proposal/model.ts';

export const previewOrderRouteOperationId =
  'production.preview-order-route.v1' as const;

export type PreviewOrderRouteNotFoundFailure = Readonly<{
  kind: 'not_found';
  code: 'production_order_route_not_found';
  message: 'The production run, order, or current batch was not found.';
  safeMessage: 'The production run, order, or current batch was not found.';
}>;

export type PreviewOrderRouteExpectedFailure =
  | PreviewOrderRouteNotFoundFailure
  | OrderRouteProposalFailure;

export type PreviewOrderRouteRepository = Readonly<{
  load: (
    input: Readonly<{
      locationId: string;
      productionRunId: string;
      productionOrderId: string;
    }>,
  ) => Promise<OrderRouteProposalContext | null>;
}>;

export type PreviewOrderRouteSignals = Readonly<{
  orderRouteOutcome: (input: {
    operation: 'preview';
    status: 'proposed' | 'rejected' | 'conflict' | 'failed';
    kind: OrderRouteProposalCommand['kind'];
    reason: ProductionOrderRouteReason;
  }) => void;
  queueConflict: (input: { operation: 'order_route_preview' }) => void;
}>;
