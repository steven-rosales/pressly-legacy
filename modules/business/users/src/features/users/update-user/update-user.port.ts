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

export type UpdateUserOperations = Readonly<{
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
  lockUser: (businessId: string, userId: string) => Promise<void>;
  loadUser: (businessId: string, userId: string) => Promise<User | null>;
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

export type UpdateUserRepository = UnitOfWork<UpdateUserOperations>;
