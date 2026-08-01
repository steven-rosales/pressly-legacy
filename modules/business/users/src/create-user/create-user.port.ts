import type {
  UserCommandOperations,
  UserTransactionPort,
} from '../user-transaction.port.ts';
import type { UserFieldName, UserProfile, UserRecord } from '../users.port.ts';

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
