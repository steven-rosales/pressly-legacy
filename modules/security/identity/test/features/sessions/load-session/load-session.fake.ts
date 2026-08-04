import type { AppError } from '@pressly/errors/app-error';

import type {
  LoadSessionStore,
  StoredSessionPrincipalRecord,
} from '../../../../src/features/sessions/load-session/load-session.port.ts';
import { makeDefaultStoredSessionPrincipal } from '../../../support/builders.ts';

export type FakeLoadSessionStoreOptions = Readonly<{
  principal?: StoredSessionPrincipalRecord | undefined;
  findByTokenHashError?: AppError;
  touchSessionError?: AppError;
}>;

export const makeFakeLoadSessionStore = (
  options: FakeLoadSessionStoreOptions = {},
) => {
  const principal =
    'principal' in options
      ? options.principal
      : makeDefaultStoredSessionPrincipal();

  const calls = {
    findByTokenHash: [] as string[],
    touchSession: [] as Array<{ sessionId: string; now: Date }>,
  };

  const store: LoadSessionStore = {
    async findByTokenHash(tokenHash) {
      calls.findByTokenHash.push(tokenHash);
      if (options.findByTokenHashError !== undefined)
        throw options.findByTokenHashError;
      return principal;
    },
    async touchSession(sessionId, now) {
      calls.touchSession.push({ sessionId, now });
      if (options.touchSessionError !== undefined)
        throw options.touchSessionError;
    },
  };

  return { store, calls };
};
