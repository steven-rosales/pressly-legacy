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
import { catchAsync, validateRequest } from '@pressly/http/express';
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

  routes.get(
    '/order-management/locations/:locationId/incoming-orders',
    input.authenticate,
    validateRequest({
      params: incomingOrderProposalParamsSchema.omit({ proposalId: true }),
      query: incomingOrderProposalListQuerySchema,
    }),
    input.authorize,
    catchAsync(async (request, response) => {
      const outcome = await input.orders.listIncomingOrderProposals({
        locationId: request.params['locationId'] as string,
        limit: request.query['limit'] as unknown as number,
        cursor: (request.query['cursor'] as string | undefined) ?? null,
        view: request.query['view'] as 'needs_review' | 'source_closed',
      });
      const value = orderManagementResultValue(outcome);
      response.json(
        apiSuccess(
          incomingOrderProposalListSchema.parse(serializeProposalPage(value)),
        ),
      );
    }),
  );

  const proposalSecurity = [
    input.authenticate,
    validateRequest({ params: incomingOrderProposalParamsSchema }),
    input.authorize,
  ] as const;

  routes.post(
    '/order-management/locations/:locationId/incoming-orders/:proposalId/accept',
    ...proposalSecurity,
    validateRequest({ body: acceptIncomingOrderProposalRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.acceptIncomingOrderProposal({
        ...request.body,
        proposalId: request.params['proposalId'] as string,
        locationId: request.params['locationId'] as string,
        context: orderManagementCommandContext(response, input.readPrincipal),
      });
      const value = orderManagementResultValue(outcome);
      response.json(
        apiSuccess(incomingOrderProposalDecisionResultSchema.parse(value)),
      );
    }),
  );

  routes.post(
    '/order-management/locations/:locationId/incoming-orders/:proposalId/reject',
    ...proposalSecurity,
    validateRequest({ body: rejectIncomingOrderProposalRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.rejectIncomingOrderProposal({
        ...request.body,
        proposalId: request.params['proposalId'] as string,
        locationId: request.params['locationId'] as string,
        context: orderManagementCommandContext(response, input.readPrincipal),
      });
      const value = orderManagementResultValue(outcome);
      response.json(
        apiSuccess(incomingOrderProposalDecisionResultSchema.parse(value)),
      );
    }),
  );

  routes.post(
    '/order-management/locations/:locationId/incoming-orders/:proposalId/restore',
    ...proposalSecurity,
    validateRequest({ body: restoreIncomingOrderProposalRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.restoreIncomingOrderProposal({
        ...request.body,
        proposalId: request.params['proposalId'] as string,
        locationId: request.params['locationId'] as string,
        context: orderManagementCommandContext(response, input.readPrincipal),
      });
      const value = orderManagementResultValue(outcome);
      response.json(
        apiSuccess(restoreIncomingOrderProposalResultSchema.parse(value)),
      );
    }),
  );

  return routes;
};
