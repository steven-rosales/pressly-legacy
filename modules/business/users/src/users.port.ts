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
export type UserFieldAuthority = Readonly<{
  authority: 'pressly' | 'source';
  source: string | null;
}>;

export type UserRecord = UserProfile &
  Readonly<{
    id: string;
    version: number;
    active: boolean;
  }>;

export type UserSourceIdentity = Readonly<{
  source: string;
  externalUserId: string;
}>;

export type SourceRevision = Readonly<{
  at: Date;
  hash: string;
  adapterVersion: string;
  observedAt: Date;
  normalizedPayload: unknown;
}>;

export type UserSourceObservation = UserSourceIdentity &
  Readonly<{
    context: CommandContext;
    profile: UserProfile;
    revision: SourceRevision;
  }>;

export type UserSourceObservationResult = Readonly<{
  userId: string;
  version: number;
  outcome: 'created' | 'applied' | 'replayed' | 'stale';
}>;

export type UserCommandResult = Readonly<{
  userId: string;
  version: number;
  replayed: boolean;
}>;

export type UserConsentResult = Readonly<{
  userId: string;
  replayed: boolean;
}>;

export type UserClockPort = Readonly<{ now: () => Date }>;

export type ObserveUserSourceCommand = UserSourceObservation;
export type ObserveUserSource = (
  command: ObserveUserSourceCommand,
) => Promise<Result<UserSourceObservationResult, AppError>>;

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

export type FollowUserSourceFieldCommand = Readonly<{
  idempotencyKey: string;
  context: CommandContext;
  userId: string;
  expectedVersion: number;
  field: UserFieldName;
  source: string;
}>;
export type FollowUserSourceField = (
  command: FollowUserSourceFieldCommand,
) => Promise<Result<UserCommandResult, AppError>>;

export type RecordUserConsentCommand = UserSourceIdentity &
  Readonly<{
    idempotencyKey: string;
    context: CommandContext;
    kind: string;
    granted: boolean;
    observedAt: Date;
    sourcePayloadHash: string;
  }>;
export type RecordUserConsent = (
  command: RecordUserConsentCommand,
) => Promise<Result<UserConsentResult, AppError>>;

export type ResolveUserSource = (
  identity: UserSourceIdentity,
) => Promise<Result<Readonly<{ userId: string }> | null, AppError>>;
