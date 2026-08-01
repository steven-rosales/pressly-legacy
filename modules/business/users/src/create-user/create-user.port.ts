import type { AppError } from '@pressly/errors';
import type { CommandContext, Result } from '@pressly/kernel';
import type {
  UserCommandOperations,
  UserTransactionPort,
} from '../persistence/user-transaction.port.ts';
import type { UserCommandResult } from '../command-execution/user-command.port.ts';
import type {
  UserFieldName,
  UserProfile,
  UserRecord,
} from '../user-profile/user-profile.port.ts';

export type CreateUserCommand = Readonly<{
  businessId: string;
  idempotencyKey: string;
  context: CommandContext;
  profile: UserProfile;
}>;

export type CreateUser = (
  command: CreateUserCommand,
) => Promise<Result<UserCommandResult, AppError>>;

export type CreateUserOperations = UserCommandOperations &
  Readonly<{
    createUser: (input: {
      businessId: string;
      profile: UserProfile;
      authorityFields: readonly UserFieldName[];
      now: Date;
    }) => Promise<UserRecord>;
    signalDuplicateContacts: (input: {
      businessId: string;
      userId: string;
      profile: UserProfile;
      now: Date;
    }) => Promise<void>;
  }>;

export type CreateUserRepository = UserTransactionPort<CreateUserOperations>;
