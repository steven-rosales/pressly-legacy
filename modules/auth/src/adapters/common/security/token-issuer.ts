import { createHmac, randomBytes } from 'node:crypto';

export const makeTokenIssuer = (secret: string) => ({
  issue: () => randomBytes(32).toString('base64url'),
  hash: (rawToken: string): string =>
    createHmac('sha256', secret).update(rawToken).digest('hex'),
});
