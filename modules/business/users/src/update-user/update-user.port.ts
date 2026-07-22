import type {
  UserCommandOperations,
  UserTransactionPort,
} from '../user-transaction.port.ts';
import type { UserFieldName, UserProfile, UserRecord } from '../users.port.ts';

export type UpdateUserOperations = UserCommandOperations &
  Readonly<{
    lockUser: (userId: string) => Promise<void>;
    loadUser: (userId: string) => Promise<UserRecord | null>;
    updateUser: (input: {
      userId: string;
      changes: Partial<UserProfile> & Readonly<{ active?: boolean }>;
      authorityFields: readonly UserFieldName[];
      nextVersion: number;
      now: Date;
    }) => Promise<void>;
    signalDuplicateContacts: (input: {
      userId: string;
      profile: UserProfile;
      now: Date;
    }) => Promise<void>;
  }>;

export type UpdateUserRepository = UserTransactionPort<UpdateUserOperations>;
