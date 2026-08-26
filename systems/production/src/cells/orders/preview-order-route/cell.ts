import { defineOperation } from '@pressly/cells';
import type {
  OrderRouteProposalCommand,
  ProductionOrderRouteProposal,
} from '../../../model/order-route-proposal/model.ts';
import { previewOrderRouteContract } from './contract.ts';
import {
  makeExecutePreviewOrderRoute,
  type PreviewOrderRouteDependencies,
} from './execute.ts';
import { previewOrderRouteHttpSurfaces } from './http.ts';
import {
  previewOrderRouteOperationId,
  type PreviewOrderRouteExpectedFailure,
} from './types.ts';

export const previewOrderRouteCellDeclaration = defineOperation<
  OrderRouteProposalCommand,
  ProductionOrderRouteProposal,
  PreviewOrderRouteExpectedFailure
>({
  kind: 'query',
  id: previewOrderRouteOperationId,
  contract: previewOrderRouteContract,
  authorization: {
    capability: 'production:stage',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'none',
  },
  surfaces: previewOrderRouteHttpSurfaces,
  observability: { operation: 'production.preview_order_route' },
});

export const makePreviewOrderRouteCell = (
  dependencies: PreviewOrderRouteDependencies,
) =>
  defineOperation(
    previewOrderRouteCellDeclaration,
    makeExecutePreviewOrderRoute(dependencies),
  );
