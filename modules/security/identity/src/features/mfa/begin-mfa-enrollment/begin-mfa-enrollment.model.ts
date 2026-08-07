export type BeginMfaEnrollmentCommand = Readonly<{
  identityId: string;
  label: string;
  requestId?: string;
}>;

export type MfaEnrollment = Readonly<{
  secret: string;
  enrollmentUri: string;
}>;
