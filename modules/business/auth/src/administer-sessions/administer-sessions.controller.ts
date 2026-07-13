import type {
  IdentitySessionParams,
  IdentitySessionsParams,
} from '@pressly/contracts';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import { result } from '@pressly/kernel';
import type { RequestHandler, Response } from 'express';
import type { ListIdentitySessions } from './list-identity-sessions.usecase.ts';
import type { RevokeIdentitySessions } from './revoke-identity-sessions.usecase.ts';

export type ReadPrincipalIdentityId = (res: Response) => string;

export const makeListIdentitySessionsController = (
  listIdentitySessions: ListIdentitySessions,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const params = req.params as IdentitySessionsParams;
    const found = await listIdentitySessions(params.identityId);

    if (result.isErr(found)) {
      res.status(found.error.status).json(apiFailure(found.error));
      return;
    }

    res.status(200).json(apiSuccess(found.value));
  });

export const makeRevokeIdentitySessionsController = (input: {
  revokeIdentitySessions: RevokeIdentitySessions;
  readPrincipalIdentityId: ReadPrincipalIdentityId;
  mode: 'selected' | 'all';
}): RequestHandler =>
  catchAsync(async (req, res) => {
    const params = req.params as IdentitySessionParams;
    const revoked = await input.revokeIdentitySessions({
      principalIdentityId: input.readPrincipalIdentityId(res),
      identityId: params.identityId,
      ...(input.mode === 'selected' ? { sessionId: params.sessionId } : {}),
      ...((res.locals?.['requestId'] as string | undefined) === undefined
        ? {}
        : { requestId: res.locals?.['requestId'] as string }),
    });

    if (result.isErr(revoked)) {
      res.status(revoked.error.status).json(apiFailure(revoked.error));
      return;
    }

    res.status(200).json(apiSuccess(revoked.value));
  });
