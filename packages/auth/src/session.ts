export type Session = Readonly<{
  id: string;
  identityId: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}>;

export const isSessionExpired = (
  session: Pick<Session, 'expiresAt'>,
  now: Date,
): boolean => session.expiresAt.getTime() <= now.getTime();

export const isSessionRevoked = (
  session: Pick<Session, 'revokedAt'>,
): boolean => session.revokedAt !== undefined && session.revokedAt !== null;

export const sessionAgeMinutes = (
  session: Pick<Session, 'issuedAt'>,
  now: Date,
): number =>
  Math.max(
    0,
    Math.floor((now.getTime() - session.issuedAt.getTime()) / 60_000),
  );
