import { result } from '@pressly/kernel';
import { userError } from '../user.error.ts';
import type { ResolveUserSource } from '../users.port.ts';
import type { ResolveUserSourceRepository } from './resolve-user-source.port.ts';

export const makeResolveUserSource =
  (repo: ResolveUserSourceRepository): ResolveUserSource =>
  async (identity) => {
    try {
      return result.ok(await repo.resolveSource(identity));
    } catch (error) {
      return result.err(
        userError(
          'USER_SOURCE_RESOLUTION_FAILED',
          'The source user could not be resolved.',
          503,
          error,
        ),
      );
    }
  };
