import type {
  RecordUserConsentCommand,
  UserConsentResult,
  UserSourceIdentity,
} from '../users.port.ts';
import type { UserTransactionPort } from '../user-transaction.port.ts';

export type StoredUserConsent = Readonly<{
  userId: string;
  source: string;
  kind: string;
  granted: boolean;
  sourcePayloadHash: string;
}>;

export type RecordUserConsentOperations = Readonly<{
  lockConsent: (idempotencyKey: string) => Promise<void>;
  loadConsent: (idempotencyKey: string) => Promise<StoredUserConsent | null>;
  resolveSource: (
    identity: UserSourceIdentity,
  ) => Promise<Readonly<{ userId: string }> | null>;
  insertConsent: (input: {
    command: RecordUserConsentCommand;
    userId: string;
  }) => Promise<UserConsentResult>;
}>;

export type RecordUserConsentRepository =
  UserTransactionPort<RecordUserConsentOperations>;
