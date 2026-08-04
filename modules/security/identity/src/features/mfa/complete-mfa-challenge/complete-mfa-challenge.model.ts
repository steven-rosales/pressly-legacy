export type CompleteMfaChallengeCommand = Readonly<
  (
    | Readonly<{
        challengeToken: string;
        method: 'totp';
        code: string;
      }>
    | Readonly<{
        challengeToken: string;
        method: 'recovery';
        code: string;
      }>
  ) &
    Readonly<{ requestId?: string }>
>;
