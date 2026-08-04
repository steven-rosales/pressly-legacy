import type { RequestHandler } from 'express';
import { catchAsync, sendValidatedApiResult } from '@pressly/http/express';
import type { LoadSession } from './load-session.usecase.ts';
import { readBearerToken } from '../../../foundations/adapters/http/authentication-request/read-bearer.adapter.ts';
import {
  loadSessionContract,
  toLoadSessionHttpError,
  toSessionResult,
} from './load-session.contract.mapper.ts';

export const makeLoadSessionController = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const loadSessionResult = await loadSession({
      bearerToken: readBearerToken(req.header('authorization') ?? undefined),
    });

    sendValidatedApiResult(res, loadSessionResult, {
      schema: loadSessionContract.response,
      present: toSessionResult,
      mapFailure: toLoadSessionHttpError,
    });
  });
