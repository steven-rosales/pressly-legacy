export type Session = Readonly<{
  id: string;
  identityId: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  lastUsedAt: Date;
}>;

export const isSessionExpired = (
  session: Pick<Session, 'expiresAt'>,
  now: Date,
): boolean => session.expiresAt.getTime() <= now.getTime();

export const isSessionRevoked = (
  session: Pick<Session, 'revokedAt'>,
): boolean => session.revokedAt !== undefined && session.revokedAt !== null;

export const isSessionIdleExpired = (
  session: Pick<Session, 'lastUsedAt'>,
  now: Date,
  idleTimeoutMinutes: number,
): boolean =>
  now.getTime() - session.lastUsedAt.getTime() >= idleTimeoutMinutes * 60_000;

export const sessionAgeMinutes = (
  session: Pick<Session, 'issuedAt'>,
  now: Date,
): number =>
  Math.max(
    0,
    Math.floor((now.getTime() - session.issuedAt.getTime()) / 60_000),
  );
