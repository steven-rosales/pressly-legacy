import { makeAppError } from '@pressly/errors';

export const invalidCredentials = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'invalid_credentials',
    message: 'Invalid email or password.',
    safeMessage: 'Invalid email or password.',
    status: 401,
  });

export const loginRateLimited = () =>
  makeAppError({
    kind: 'RateLimitError',
    code: 'login_rate_limited',
    message: 'Too many failed login attempts.',
    safeMessage: 'Too many failed login attempts. Try again later.',
    status: 429,
  });
