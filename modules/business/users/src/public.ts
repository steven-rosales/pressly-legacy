export {
  decodeUserCursor,
  encodeUserCursor,
  makePostgresCanonicalSourceUserAcceptanceAdapter,
  makePostgresUsersApplication,
} from './main.ts';

export type {
  CanonicalSourceUserAcceptanceAdapter,
  CanonicalSourceUserAcceptanceInput,
  CanonicalSourceUserAcceptanceResult,
  CreateUser,
  GetUser,
  ListUsers,
  UpdateUser,
  UsersApplication,
  UsersApplicationDeps,
} from './main.ts';

export type { CreateUserCommand } from './features/users/create-user/create-user.model.ts';
export type { CreateUserFailure } from './features/users/create-user/create-user.failure.ts';
export type {
  ListUsersQuery,
  UserListResult,
  UserSummary,
} from './features/users/read-users/read-users.model.ts';
export type { ReadUsersFailure } from './features/users/read-users/read-users.failure.ts';
export type { UpdateUserCommand } from './features/users/update-user/update-user.model.ts';
export type { UpdateUserFailure } from './features/users/update-user/update-user.failure.ts';
export type { ResolveCanonicalSourceUserFailure } from './features/sources/resolve-canonical-source-user/resolve-canonical-source-user.failure.ts';
export type { UserCommandResult } from './foundations/language/command-identity/user-command-result.model.ts';
export type { User } from './foundations/language/users/user.entity.ts';
export type {
  UserFieldName,
  UserProfile,
} from './foundations/language/users/user-profile.value.ts';
