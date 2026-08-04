import type { Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { makePostgresCreateUserRepository } from '../features/users/create-user/create-user.repo.ts';
import { makeCreateUser } from '../features/users/create-user/create-user.usecase.ts';
import { makePostgresReadUsersRepository } from '../features/users/read-users/read-users.repo.ts';
import {
  makeGetUser,
  makeListUsers,
} from '../features/users/read-users/read-users.usecase.ts';
import {
  decodeUserCursor,
  encodeUserCursor,
} from '../features/users/read-users/user-pagination.policy.ts';
import { makePostgresUpdateUserRepository } from '../features/users/update-user/update-user.repo.ts';
import { makeUpdateUser } from '../features/users/update-user/update-user.usecase.ts';
import type { ResolveCanonicalSourceUserFailure } from '../features/sources/resolve-canonical-source-user/resolve-canonical-source-user.failure.ts';
import type {
  ResolveCanonicalSourceUserCommand,
  ResolvedCanonicalSourceUser,
} from '../features/sources/resolve-canonical-source-user/resolve-canonical-source-user.model.ts';
import { makePostgresResolveCanonicalSourceUserRepository } from '../features/sources/resolve-canonical-source-user/resolve-canonical-source-user.repo.ts';
import { makeResolveCanonicalSourceUser } from '../features/sources/resolve-canonical-source-user/resolve-canonical-source-user.usecase.ts';

export type UsersApplicationDeps = Readonly<{
  db: Parameters<typeof makePostgresCreateUserRepository>[0];
  clock: Clock;
}>;

export const makePostgresUsersApplication = (deps: UsersApplicationDeps) => {
  const createUser = makeCreateUser({
    repo: makePostgresCreateUserRepository(deps.db),
    clock: deps.clock,
  });
  const updateUser = makeUpdateUser({
    repo: makePostgresUpdateUserRepository(deps.db),
    clock: deps.clock,
  });
  const readUsers = makePostgresReadUsersRepository(deps.db);
  const listUsers = makeListUsers(readUsers);
  const getUser = makeGetUser(readUsers);

  return Object.freeze({
    createUser,
    updateUser,
    listUsers,
    getUser,
  });
};

export type UsersApplication = ReturnType<typeof makePostgresUsersApplication>;
export type CreateUser = UsersApplication['createUser'];
export type UpdateUser = UsersApplication['updateUser'];
export type ListUsers = UsersApplication['listUsers'];
export type GetUser = UsersApplication['getUser'];

type CanonicalSourceUserExecutor = Parameters<
  typeof makePostgresResolveCanonicalSourceUserRepository
>[0];

export type CanonicalSourceUserAcceptanceInput =
  ResolveCanonicalSourceUserCommand;
export type CanonicalSourceUserAcceptanceResult = ResolvedCanonicalSourceUser;
export type CanonicalSourceUserAcceptanceAdapter = Readonly<{
  resolveOrCreate: (
    db: CanonicalSourceUserExecutor,
    input: CanonicalSourceUserAcceptanceInput,
  ) => Promise<
    Result<
      CanonicalSourceUserAcceptanceResult,
      ResolveCanonicalSourceUserFailure
    >
  >;
}>;

export const makePostgresCanonicalSourceUserAcceptanceAdapter =
  (): CanonicalSourceUserAcceptanceAdapter =>
    Object.freeze({
      resolveOrCreate: (db, input) => {
        const resolveCanonicalSourceUser = makeResolveCanonicalSourceUser(
          makePostgresResolveCanonicalSourceUserRepository(db),
        );
        return resolveCanonicalSourceUser(input);
      },
    });

export { decodeUserCursor, encodeUserCursor };
