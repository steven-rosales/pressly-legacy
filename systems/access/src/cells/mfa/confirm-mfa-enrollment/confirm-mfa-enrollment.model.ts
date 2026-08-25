export type ConfirmMfaEnrollmentCommand = Readonly<{
  identityId: string;
  sessionId: string;
  code: string;
  requestId?: string;
}>;
