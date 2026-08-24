import type {
  AuthenticatedPrincipal,
  AuthenticatedSession,
} from '../../../model/language/authentication-session/authenticated-session.model.ts';

export type LoginCommand = Readonly<{
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}>;

export type MfaChallenge = Readonly<{
  status: 'mfa_required';
  challengeToken: string;
  expiresAt: Date;
  principal: AuthenticatedPrincipal;
}>;

export type LoginOutcome = AuthenticatedSession | MfaChallenge;
