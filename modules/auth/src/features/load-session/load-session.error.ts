import { makeAppError } from '@pressly/errors';

export const missingBearerToken = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'missing_bearer_token',
    message: 'Bearer token is required.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });

export const invalidSession = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'invalid_session',
    message: 'Session is invalid.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });

export const expiredSession = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'session_expired',
    message: 'Session is expired.',
    safeMessage: 'Please log in again.',
    status: 401,
  });
