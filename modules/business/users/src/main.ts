import type { Database } from '@pressly/db';
import { makePostgresCreateUserRepository } from './create-user/create-user.repo.ts';
import { makeCreateUser } from './create-user/create-user.usecase.ts';
import { makePostgresUpdateUserRepository } from './update-user/update-user.repo.ts';
import { makeUpdateUser } from './update-user/update-user.usecase.ts';
import type { UserClockPort } from './users.port.ts';

export type UsersApplicationDeps = Readonly<{
  db: Database;
  clock: UserClockPort;
}>;

export const makePostgresUsersApplication = (deps: UsersApplicationDeps) => {
  const createRepo = makePostgresCreateUserRepository(deps.db);
  const updateRepo = makePostgresUpdateUserRepository(deps.db);
  return {
    createUser: makeCreateUser({ repo: createRepo, clock: deps.clock }),
    updateUser: makeUpdateUser({ repo: updateRepo, clock: deps.clock }),
  };
};

export type UsersApplication = ReturnType<typeof makePostgresUsersApplication>;
