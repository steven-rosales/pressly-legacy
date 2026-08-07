import type { Result } from '@pressly/kernel';
import type { ResolveCanonicalSourceUserFailure } from './resolve-canonical-source-user.failure.ts';
import type {
  ResolveCanonicalSourceUserCommand,
  ResolvedCanonicalSourceUser,
} from './resolve-canonical-source-user.model.ts';

export type ResolveCanonicalSourceUserRepository = Readonly<{
  resolveOrCreate: (
    command: ResolveCanonicalSourceUserCommand,
  ) => Promise<
    Result<ResolvedCanonicalSourceUser, ResolveCanonicalSourceUserFailure>
  >;
}>;
