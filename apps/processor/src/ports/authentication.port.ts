import type {
  ProcessorAuthenticatedSession,
  ProcessorLoginResult,
} from '@pressly/contracts/auth';

export type AuthenticationPort = Readonly<{
  restore: () => Promise<ProcessorAuthenticatedSession>;
  login: (credentials: {
    email: string;
    password: string;
  }) => Promise<ProcessorLoginResult>;
  completeMfa: (input: {
    method: 'totp' | 'recovery';
    code: string;
  }) => Promise<ProcessorAuthenticatedSession>;
  logout: () => Promise<void>;
}>;
