import { authError } from '@pressly/errors';

const missingBearerToken = () =>
  authError({
    code: 'missing_bearer_token',
    message: 'Bearer token is required.',
    safeMessage: 'Authentication is required.',
  });

export const readBearerToken = (authorization: string | undefined): string => {
  if (authorization === undefined) throw missingBearerToken();

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || token === undefined || token.trim() === '')
    throw missingBearerToken();

  return token;
};
