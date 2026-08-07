import {
  acceptIncomingOrderProposalRequestSchema,
  incomingOrderProposalDecisionResultSchema,
  incomingOrderProposalListQuerySchema,
  incomingOrderProposalListSchema,
  incomingOrderProposalParamsSchema,
  rejectIncomingOrderProposalRequestSchema,
  restoreIncomingOrderProposalRequestSchema,
  restoreIncomingOrderProposalResultSchema,
} from '@pressly/contracts/orders';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
import type {
  IncomingOrderProposalListResult,
  OrdersApplication,
} from '@pressly/orders';
import { Router, type RequestHandler } from 'express';
import {
  orderManagementCommandContext,
  type ReadOrderManagementPrincipal,
} from '../command-context.adapter.ts';
import { orderManagementResultValue } from './order-management.error.ts';

type IncomingOrderProposalApplication = Pick<
  OrdersApplication,
  | 'listIncomingOrderProposals'
  | 'acceptIncomingOrderProposal'
  | 'rejectIncomingOrderProposal'
  | 'restoreIncomingOrderProposal'
>;

const serializeProposalPage = (page: IncomingOrderProposalListResult) => ({
  ...page,
  items: page.items.map((proposal) => ({
    ...proposal,
    dueAt: proposal.dueAt.toISOString(),
    sourceReportedAt: proposal.sourceReportedAt.toISOString(),
    reportedAt: proposal.reportedAt.toISOString(),
    sourceClosure:
      proposal.sourceClosure === null
        ? null
        : {
            ...proposal.sourceClosure,
            observedAt: proposal.sourceClosure.observedAt.toISOString(),
          },
  })),
});

export const makeIncomingOrderProposalRoutes = (input: {
  orders: IncomingOrderProposalApplication;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
}): Router => {
  const routes = Router();
  const listController = defineValidatedController({
    request: {
      params: incomingOrderProposalParamsSchema.omit({ proposalId: true }),
      query: incomingOrderProposalListQuerySchema,
    },
    handle: async ({ params, query }, { response }) => {
      const outcome = await input.orders.listIncomingOrderProposals({
        locationId: params.locationId,
        limit: query.limit,
        cursor: query.cursor ?? null,
        view: query.view,
      });
      const value = orderManagementResultValue(outcome);
      response.json(
        apiSuccess(
          incomingOrderProposalListSchema.parse(serializeProposalPage(value)),
        ),
      );
    },
  });
  const acceptController = defineValidatedController({
    request: {
      params: incomingOrderProposalParamsSchema,
      body: acceptIncomingOrderProposalRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = await input.orders.acceptIncomingOrderProposal({
        ...body,
        proposalId: params.proposalId,
        locationId: params.locationId,
        context: orderManagementCommandContext(response, input.readPrincipal),
      });
      const value = orderManagementResultValue(outcome);
      response.json(
        apiSuccess(incomingOrderProposalDecisionResultSchema.parse(value)),
      );
    },
  });
  const rejectController = defineValidatedController({
    request: {
      params: incomingOrderProposalParamsSchema,
      body: rejectIncomingOrderProposalRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = await input.orders.rejectIncomingOrderProposal({
        ...body,
        proposalId: params.proposalId,
        locationId: params.locationId,
        context: orderManagementCommandContext(response, input.readPrincipal),
      });
      const value = orderManagementResultValue(outcome);
      response.json(
        apiSuccess(incomingOrderProposalDecisionResultSchema.parse(value)),
      );
    },
  });
  const restoreController = defineValidatedController({
    request: {
      params: incomingOrderProposalParamsSchema,
      body: restoreIncomingOrderProposalRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = await input.orders.restoreIncomingOrderProposal({
        ...body,
        proposalId: params.proposalId,
        locationId: params.locationId,
        context: orderManagementCommandContext(response, input.readPrincipal),
      });
      const value = orderManagementResultValue(outcome);
      response.json(
        apiSuccess(restoreIncomingOrderProposalResultSchema.parse(value)),
      );
    },
  });

  routes.get(
    '/order-management/locations/:locationId/incoming-orders',
    input.authenticate,
    listController.validate,
    input.authorize,
    listController.handle,
  );

  routes.post(
    '/order-management/locations/:locationId/incoming-orders/:proposalId/accept',
    input.authenticate,
    acceptController.validators.params,
    input.authorize,
    acceptController.validators.body,
    acceptController.handle,
  );

  routes.post(
    '/order-management/locations/:locationId/incoming-orders/:proposalId/reject',
    input.authenticate,
    rejectController.validators.params,
    input.authorize,
    rejectController.validators.body,
    rejectController.handle,
  );

  routes.post(
    '/order-management/locations/:locationId/incoming-orders/:proposalId/restore',
    input.authenticate,
    restoreController.validators.params,
    input.authorize,
    restoreController.validators.body,
    restoreController.handle,
  );

  return routes;
};
