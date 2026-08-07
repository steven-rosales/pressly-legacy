import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { Result } from '@pressly/kernel';
import type { ResolveCanonicalSourceUserFailure } from './resolve-canonical-source-user.failure.ts';
import type {
  ResolveCanonicalSourceUserCommand,
  ResolvedCanonicalSourceUser,
} from './resolve-canonical-source-user.model.ts';
import type { ResolveCanonicalSourceUserRepository } from './resolve-canonical-source-user.port.ts';

export type ResolveCanonicalSourceUser = (
  command: ResolveCanonicalSourceUserCommand,
) => Promise<
  Result<ResolvedCanonicalSourceUser, ResolveCanonicalSourceUserFailure>
>;

const throwCanonicalSourceUserPersistenceFailure = (cause: unknown): never => {
  throw mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'canonical_source_user_resolution_failed',
      message: 'The canonical source user could not be resolved.',
      safeMessage: 'The canonical source user could not be resolved.',
      status: 503,
      cause: unknownCause,
    }),
  );
};

export const makeResolveCanonicalSourceUser = (
  repository: ResolveCanonicalSourceUserRepository,
): ResolveCanonicalSourceUser =>
  async function resolveCanonicalSourceUser(command) {
    try {
      return await repository.resolveOrCreate(command);
    } catch (error) {
      return throwCanonicalSourceUserPersistenceFailure(error);
    }
  };
