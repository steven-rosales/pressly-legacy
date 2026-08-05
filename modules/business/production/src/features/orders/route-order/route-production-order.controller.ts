import {
  commitProductionOrderRouteRequestSchema,
  commitProductionOrderRouteResultSchema,
  previewProductionOrderRouteRequestSchema,
  productionOrderRouteProposalSchema,
  productionOrderRoutingParamsSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toCommitProductionOrderRouteCommand,
  toCommitProductionOrderRouteResult,
  toPreviewProductionOrderRouteCommand,
  toProductionOrderRouteProposal,
} from './route-production-order.contract.mapper.ts';
import type {
  CommitProductionOrderRoute,
  PreviewProductionOrderRoute,
} from './route-production-order.port.ts';

type ControllerInput = Readonly<{
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}>;

const routingIdentity = (
  params: Readonly<{
    locationId: string;
    productionRunId: string;
    productionOrderId: string;
  }>,
  response: Parameters<RequestHandler>[1],
  input: ControllerInput,
) => ({
  locationId: params.locationId,
  productionRunId: params.productionRunId,
  productionOrderId: params.productionOrderId,
  actorId: input.readActorId(response),
});

export const makePreviewProductionOrderRouteController = (
  input: ControllerInput & { preview: PreviewProductionOrderRoute },
) =>
  defineValidatedController({
    request: {
      params: productionOrderRoutingParamsSchema,
      body: previewProductionOrderRouteRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.preview(
          toPreviewProductionOrderRouteCommand(
            routingIdentity(params, response, input),
            body,
          ),
        ),
        {
          schema: productionOrderRouteProposalSchema,
          present: toProductionOrderRouteProposal,
        },
      );
    },
  });

export const makeCommitProductionOrderRouteController = (
  input: ControllerInput & { commit: CommitProductionOrderRoute },
) =>
  defineValidatedController({
    request: {
      params: productionOrderRoutingParamsSchema,
      body: commitProductionOrderRouteRequestSchema,
    },
    handle: async ({ body, params }, { response }) => {
      sendValidatedProductionResult(
        response,
        await input.commit(
          toCommitProductionOrderRouteCommand(
            routingIdentity(params, response, input),
            body,
          ),
        ),
        {
          schema: commitProductionOrderRouteResultSchema,
          present: toCommitProductionOrderRouteResult,
        },
      );
    },
  });
