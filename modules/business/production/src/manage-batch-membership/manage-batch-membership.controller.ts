import type {
  FreezeProductionBatchCommand,
  UnfreezeProductionBatchCommand,
} from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type {
  BatchMembershipAction,
  ManageBatchMembership,
} from './manage-batch-membership.port.ts';

type MembershipCommand =
  | FreezeProductionBatchCommand
  | UnfreezeProductionBatchCommand;

export const makeManageBatchMembershipController = (input: {
  manage: ManageBatchMembership;
  action: BatchMembershipAction;
  authorizedAction: 'production:queue' | 'production:override';
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.manage({
        ...(request.body as Omit<
          MembershipCommand,
          'locationId' | 'productionRunId' | 'productionBatchId'
        >),
        locationId: request.params['locationId'] as string,
        productionRunId: request.params['productionRunId'] as string,
        productionBatchId: request.params['productionBatchId'] as string,
        action: input.action,
        actorId: input.readActorId(response),
        authorizedAction: input.authorizedAction,
      }),
    );
  });
