import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';
import { utcIsoFromDate } from '@pressly/time';
import type { LoadSession } from './load-session.usecase.ts';
import { readBearerToken } from '../http/read-bearer.ts';

const rolesFromLoadedSession = (
  assignments: readonly { role: string }[],
): string[] => [...new Set(assignments.map((assignment) => assignment.role))];

export const makeLoadSessionController = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const loadSessionResult = await loadSession({
      bearerToken: readBearerToken(req.header('authorization') ?? undefined),
    });

    if (result.isErr(loadSessionResult)) {
      res
        .status(loadSessionResult.error.status)
        .json(apiFailure(loadSessionResult.error));
      return;
    }

    if (loadSessionResult.value.principal.sessionExpiresAt === undefined)
      throw makeAppError({
        kind: 'InvariantViolationError',
        code: 'loaded_session_missing_expiry',
        message: 'Loaded session principal is missing session expiry.',
        safeMessage: 'Session could not be loaded.',
        status: 500,
      });

    res.status(200).json(
      apiSuccess({
        principal: {
          identityId: loadSessionResult.value.principal.identityId,
          displayName: loadSessionResult.value.principal.displayName,
          ...(loadSessionResult.value.principal.email === undefined
            ? {}
            : { email: loadSessionResult.value.principal.email }),
          roles: rolesFromLoadedSession(
            loadSessionResult.value.principalAttributes.assignments,
          ),
        },
        expiresAt: utcIsoFromDate(
          loadSessionResult.value.principal.sessionExpiresAt,
        ),
      }),
    );
  });
