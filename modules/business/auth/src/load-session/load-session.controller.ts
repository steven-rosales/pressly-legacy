import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import { invariantViolationError } from '@pressly/errors';
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

    if (result.isErr(loadSessionResult)) throw loadSessionResult.error;

    if (loadSessionResult.value.principal.sessionExpiresAt === undefined)
      throw invariantViolationError({
        code: 'loaded_session_missing_expiry',
        message: 'Loaded session principal is missing session expiry.',
        safeMessage: 'Session could not be loaded.',
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
