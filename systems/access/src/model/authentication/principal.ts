export type CustomerAudience =
  | Readonly<{ audience: 'customer'; customerId: string }>
  | Readonly<{ audience?: never; customerId?: never }>;

export type Principal = Readonly<{
  identityId: string;
  kind: 'human' | 'service';
  displayName: string;
  email?: string;
  sessionId?: string;
  sessionIssuedAt?: Date;
  sessionExpiresAt?: Date;
}> &
  CustomerAudience;

export const customerAudience = (
  customerId: string | null | undefined,
): CustomerAudience =>
  customerId === null || customerId === undefined
    ? {}
    : { audience: 'customer', customerId };

export const principalLabel = (principal: Principal): string =>
  principal.email ?? principal.displayName;
