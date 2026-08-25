import { createHmac, randomBytes } from 'node:crypto';

export type TokenIssuer = Readonly<{
  issue: () => string;
  hash: (rawToken: string) => string;
}>;

export const makeTokenIssuer = (secret: string): TokenIssuer => ({
  issue: () => randomBytes(32).toString('base64url'),
  hash: (rawToken) =>
    createHmac('sha256', secret).update(rawToken).digest('hex'),
});
