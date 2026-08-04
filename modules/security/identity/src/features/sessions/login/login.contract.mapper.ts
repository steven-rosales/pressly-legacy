import {
  loginRequestSchema,
  loginResultSchema,
  type LoginResult,
} from '@pressly/contracts/auth';
import { utcIsoFromDate } from '@pressly/time';
import { authError, rateLimitError } from '@pressly/errors/factories';
import { projectAuthenticatedSession } from '../../../foundations/language/authentication-session/authenticated-session.projection.ts';
import type { LoginOutcome } from './login.model.ts';
import type { LoginFailure } from './login.failure.ts';

export const loginContract = Object.freeze({
  request: loginRequestSchema,
  response: loginResultSchema,
});

export const toLoginResult = (outcome: LoginOutcome): LoginResult =>
  'status' in outcome
    ? {
        status: 'mfa_required',
        challengeToken: outcome.challengeToken,
        expiresAt: utcIsoFromDate(outcome.expiresAt),
      }
    : projectAuthenticatedSession(outcome);

export const toLoginHttpError = (failure: LoginFailure) =>
  failure.kind === 'rate_limit'
    ? rateLimitError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
      })
    : authError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
      });
