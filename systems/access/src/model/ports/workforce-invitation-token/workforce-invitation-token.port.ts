export type InvitationTokenService = Readonly<{
  issue: () => string;
  hash: (rawToken: string) => string;
}>;
