import type {
  LoginRequest,
  LoginResult,
  LogoutResult,
  SessionResult,
} from '@pressly/contracts';
import type { AppError, Result } from '@pressly/errors';

export type AuthCliClient = Readonly<{
  login: (request: LoginRequest) => Promise<Result<LoginResult, AppError>>;
  loadSession: () => Promise<Result<SessionResult, AppError>>;
  logout: () => Promise<Result<LogoutResult, AppError>>;
  close: () => Promise<void>;
}>;
