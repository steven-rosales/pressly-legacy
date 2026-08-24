import { createHmac, timingSafeEqual } from 'node:crypto';

export type SessionCsrfProof = Readonly<{
  derive: (sessionToken: string, serverSecret: string) => string;
  verify: (
    providedProof: string | undefined,
    sessionToken: string,
    serverSecret: string,
  ) => boolean;
}>;

const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

export const defineSessionCsrfProof = (domain: string): SessionCsrfProof => {
  const derive = (sessionToken: string, serverSecret: string): string =>
    createHmac('sha256', serverSecret)
      .update(domain, 'utf8')
      .update(sessionToken, 'utf8')
      .digest('base64url');

  return {
    derive,
    verify: (providedProof, sessionToken, serverSecret) =>
      providedProof !== undefined &&
      constantTimeEqual(providedProof, derive(sessionToken, serverSecret)),
  };
};
