export type Principal = Readonly<{
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  sessionId?: string;
  sessionIssuedAt?: Date;
  sessionExpiresAt?: Date;
}>;

export const principalLabel = (principal: Principal): string =>
  principal.email ?? principal.displayName;
