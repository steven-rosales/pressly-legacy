import type {
  CommitProductionOrderBacklogCommand,
  PreviewProductionOrderBacklogCommand,
} from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type {
  CommitProductionOrderBacklog,
  PreviewProductionOrderBacklog,
} from './review-production-order-backlog.port.ts';

type PreviewRequest = Omit<PreviewProductionOrderBacklogCommand, 'locationId'>;
type CommitRequest = Omit<CommitProductionOrderBacklogCommand, 'locationId'>;

export const makePreviewProductionOrderBacklogController = (input: {
  preview: PreviewProductionOrderBacklog;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.preview({
        ...(request.body as PreviewRequest),
        locationId: request.params['locationId'] as string,
      }),
    );
  });

export const makeCommitProductionOrderBacklogController = (input: {
  commit: CommitProductionOrderBacklog;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.commit({
        ...(request.body as CommitRequest),
        locationId: request.params['locationId'] as string,
        actorId: input.readActorId(response),
      }),
    );
  });
