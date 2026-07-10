import type {
  CompleteMfaChallengeRequest,
  ConfirmMfaEnrollmentRequest,
} from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';
import { apiFailure, apiSuccess } from '@pressly/http';
import { catchAsync } from '@pressly/http/express';
import { result } from '@pressly/kernel';
import type { RequestHandler, Response } from 'express';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  BeginMfaEnrollment,
  ConfirmMfaEnrollment,
} from './enroll-mfa.usecase.ts';
import type { CompleteMfaChallenge } from './complete-mfa-challenge.usecase.ts';
import type {
  RegenerateMfaRecoveryCodes,
  RemoveMfa,
} from './manage-mfa.usecase.ts';

type MfaPrincipal = Readonly<{
  identityId: string;
  sessionId: string;
  label: string;
}>;

const readMfaPrincipal = (res: Response): MfaPrincipal => {
  const auth = res.locals['auth'] as
    | {
        principal?: {
          identityId?: string;
          sessionId?: string;
          email?: string;
          displayName?: string;
        };
      }
    | undefined;
  const principal = auth?.principal;
  if (principal?.identityId && principal.sessionId)
    return {
      identityId: principal.identityId,
      sessionId: principal.sessionId,
      label: principal.email ?? principal.displayName ?? principal.identityId,
    };

  throw makeAppError({
    kind: 'AuthError',
    code: 'missing_mfa_principal',
    message: 'Authenticated MFA principal context is missing.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });
};

const readRequestId = (res: Response): string | undefined =>
  res.locals?.['requestId'] as string | undefined;

const sendResult = <T>(res: Response, value: Result<T, AppError>): void => {
  if (result.isErr(value)) {
    res.status(value.error.status).json(apiFailure(value.error));
    return;
  }
  res.status(200).json(apiSuccess(value.value));
};

export const makeCompleteMfaChallengeController = (
  complete: CompleteMfaChallenge,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const requestId = readRequestId(res);
    sendResult(
      res,
      await complete({
        ...(req.body as CompleteMfaChallengeRequest),
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
  });

export const makeBeginMfaEnrollmentController = (
  begin: BeginMfaEnrollment,
): RequestHandler =>
  catchAsync(async (_req, res) => {
    const principal = readMfaPrincipal(res);
    const requestId = readRequestId(res);
    sendResult(
      res,
      await begin({
        identityId: principal.identityId,
        label: principal.label,
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
  });

export const makeConfirmMfaEnrollmentController = (
  confirm: ConfirmMfaEnrollment,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const principal = readMfaPrincipal(res);
    const body = req.body as ConfirmMfaEnrollmentRequest;
    const requestId = readRequestId(res);
    sendResult(
      res,
      await confirm({
        identityId: principal.identityId,
        sessionId: principal.sessionId,
        code: body.code,
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
  });

export const makeRegenerateRecoveryCodesController = (
  regenerate: RegenerateMfaRecoveryCodes,
): RequestHandler =>
  catchAsync(async (_req, res) => {
    const requestId = readRequestId(res);
    sendResult(
      res,
      await regenerate({
        identityId: readMfaPrincipal(res).identityId,
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
  });

export const makeRemoveMfaController = (remove: RemoveMfa): RequestHandler =>
  catchAsync(async (_req, res) => {
    const principal = readMfaPrincipal(res);
    const requestId = readRequestId(res);
    sendResult(
      res,
      await remove({
        identityId: principal.identityId,
        sessionId: principal.sessionId,
        ...(requestId === undefined ? {} : { requestId }),
      }),
    );
  });
