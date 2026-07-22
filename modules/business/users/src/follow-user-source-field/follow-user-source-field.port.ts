import type {
  UserCommandOperations,
  UserTransactionPort,
} from '../user-transaction.port.ts';
import type { UserFieldName, UserRecord } from '../users.port.ts';

export type FollowUserSourceFieldOperations = UserCommandOperations &
  Readonly<{
    lockUser: (userId: string) => Promise<void>;
    loadUser: (userId: string) => Promise<UserRecord | null>;
    sourceLinkExists: (input: {
      userId: string;
      source: string;
    }) => Promise<boolean>;
    followSourceField: (input: {
      userId: string;
      field: UserFieldName;
      source: string;
      nextVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type FollowUserSourceFieldRepository =
  UserTransactionPort<FollowUserSourceFieldOperations>;
