export type RevokeSessionCommand = Readonly<{
  bearerToken: string;
  requestId?: string;
}>;

export type RevokeSessionOutcome = Readonly<{ revoked: true }>;
