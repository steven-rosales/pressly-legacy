import { authError, rateLimitError } from '@pressly/errors';

export const invalidCredentials = () =>
  authError({
    code: 'invalid_credentials',
    message: 'Invalid email or password.',
    safeMessage: 'Invalid email or password.',
  });

export const loginRateLimited = () =>
  rateLimitError({
    code: 'login_rate_limited',
    message: 'Too many failed login attempts.',
    safeMessage: 'Too many failed login attempts. Try again later.',
  });
