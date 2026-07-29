import type { AppError } from '@pressly/errors';
import type { CommandContext, Result } from '@pressly/kernel';

export type UserProfile = Readonly<{
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
}>;

export type UserFieldName = keyof UserProfile;

export type UserRecord = UserProfile &
  Readonly<{
    id: string;
    version: number;
    active: boolean;
  }>;

export type UserCommandResult = Readonly<{
  userId: string;
  version: number;
  replayed: boolean;
}>;

export type UserClockPort = Readonly<{ now: () => Date }>;

export type CreateUserCommand = Readonly<{
  idempotencyKey: string;
  context: CommandContext;
  profile: UserProfile;
}>;
export type CreateUser = (
  command: CreateUserCommand,
) => Promise<Result<UserCommandResult, AppError>>;

export type UpdateUserCommand = Readonly<{
  idempotencyKey: string;
  context: CommandContext;
  userId: string;
  expectedVersion: number;
  changes: Partial<UserProfile> & Readonly<{ active?: boolean }>;
}>;
export type UpdateUser = (
  command: UpdateUserCommand,
) => Promise<Result<UserCommandResult, AppError>>;
