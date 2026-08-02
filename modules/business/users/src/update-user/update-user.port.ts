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
} from '../user-profile/user-profile.model.ts';

export type UpdateUserCommand = Readonly<{
  businessId: string;
  idempotencyKey: string;
  context: CommandContext;
  userId: string;
  expectedVersion: number;
  changes: Partial<UserProfile> & Readonly<{ active?: boolean }>;
}>;

export type UpdateUser = (
  command: UpdateUserCommand,
) => Promise<Result<UserCommandResult, AppError>>;

export type UpdateUserOperations = UserCommandOperations &
  Readonly<{
    lockUser: (businessId: string, userId: string) => Promise<void>;
    loadUser: (
      businessId: string,
      userId: string,
    ) => Promise<UserRecord | null>;
    updateUser: (input: {
      businessId: string;
      userId: string;
      changes: Partial<UserProfile> & Readonly<{ active?: boolean }>;
      authorityFields: readonly UserFieldName[];
      nextVersion: number;
      now: Date;
    }) => Promise<void>;
    signalDuplicateContacts: (input: {
      businessId: string;
      userId: string;
      profile: UserProfile;
      now: Date;
    }) => Promise<void>;
  }>;

export type UpdateUserRepository = UserTransactionPort<UpdateUserOperations>;
