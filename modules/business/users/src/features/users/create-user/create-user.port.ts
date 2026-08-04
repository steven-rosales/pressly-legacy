import type { CommandContext, UnitOfWork } from '@pressly/kernel';
import type {
  StoredUserCommandReceipt,
  UserCommandResult,
} from '../../../foundations/language/command-identity/user-command-result.model.ts';
import type { User } from '../../../foundations/language/users/user.entity.ts';
import type {
  UserFieldName,
  UserProfile,
} from '../../../foundations/language/users/user-profile.value.ts';

export type CreateUserOperations = Readonly<{
  lockCommand: (idempotencyKey: string) => Promise<void>;
  loadCommandReceipt: (
    idempotencyKey: string,
  ) => Promise<StoredUserCommandReceipt | null>;
  saveCommandReceipt: (input: {
    businessId: string;
    idempotencyKey: string;
    commandHash: string;
    context: CommandContext;
    value: UserCommandResult;
    now: Date;
  }) => Promise<void>;
  createUser: (input: {
    businessId: string;
    profile: UserProfile;
    authorityFields: readonly UserFieldName[];
    now: Date;
  }) => Promise<User>;
  signalDuplicateContacts: (input: {
    businessId: string;
    userId: string;
    profile: UserProfile;
    now: Date;
  }) => Promise<void>;
}>;

export type CreateUserRepository = UnitOfWork<CreateUserOperations>;
