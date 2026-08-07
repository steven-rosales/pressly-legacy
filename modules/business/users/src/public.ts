export {
  makePostgresCanonicalSourceUserAcceptanceAdapter,
  makePostgresUsersApplication,
} from './main.ts';

export type {
  CanonicalSourceUserAcceptanceAdapter,
  CreateUser,
  GetUser,
  ListUsers,
  UpdateUser,
  UsersApplication,
  UsersApplicationDeps,
} from './main.ts';

export {
  decodeUserCursor,
  encodeUserCursor,
} from './features/users/list-users/user-pagination.policy.ts';

export type { CreateUserCommand } from './features/users/create-user/create-user.model.ts';
export type { CreateUserFailure } from './features/users/create-user/create-user.failure.ts';
export type {
  ListUsersQuery,
  UserListResult,
} from './features/users/list-users/list-users.model.ts';
export type { ListUsersFailure } from './features/users/list-users/list-users.failure.ts';
export type { GetUserFailure } from './features/users/get-user/get-user.failure.ts';
export type { UserSummary } from './foundations/language/user-summary/user-summary.model.ts';
export type { UpdateUserCommand } from './features/users/update-user/update-user.model.ts';
export type { UpdateUserFailure } from './features/users/update-user/update-user.failure.ts';
export type { ResolveCanonicalSourceUserFailure } from './features/sources/resolve-canonical-source-user/resolve-canonical-source-user.failure.ts';
export type {
  ResolveCanonicalSourceUserCommand,
  ResolvedCanonicalSourceUser,
} from './features/sources/resolve-canonical-source-user/resolve-canonical-source-user.model.ts';
export type { UserCommandResult } from './foundations/language/command-identity/user-command-result.model.ts';
export type { User } from './foundations/language/users/user.entity.ts';
export type {
  UserFieldName,
  UserProfile,
} from './foundations/language/users/user-profile.value.ts';
