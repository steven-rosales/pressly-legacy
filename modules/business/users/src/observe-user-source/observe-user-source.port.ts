import type {
  UserFieldAuthority,
  UserFieldName,
  UserProfile,
  UserRecord,
  UserSourceIdentity,
  UserSourceObservation,
} from '../users.port.ts';
import type { UserTransactionPort } from '../user-transaction.port.ts';

export type StoredUserSourceState = Readonly<{
  sourceLinkId: string;
  user: UserRecord;
  revision: Readonly<{ at: Date; hash: string }> | null;
  authorities: ReadonlyMap<UserFieldName, UserFieldAuthority>;
}>;

export type ObserveUserSourceOperations = Readonly<{
  lockSource: (identity: UserSourceIdentity) => Promise<void>;
  loadSource: (
    identity: UserSourceIdentity,
  ) => Promise<StoredUserSourceState | null>;
  createSourceUser: (observation: UserSourceObservation) => Promise<UserRecord>;
  applySourceUser: (input: {
    current: StoredUserSourceState;
    observation: UserSourceObservation;
    changes: Partial<UserProfile>;
    nextProfile: UserProfile;
    nextVersion: number;
    missingAuthorities: readonly UserFieldName[];
  }) => Promise<void>;
}>;

export type ObserveUserSourceRepository =
  UserTransactionPort<ObserveUserSourceOperations>;
