export {
  makePostgresUsersApplication,
  type UsersApplication,
  type UsersApplicationDeps,
} from './main.ts';
export { decideSourceRevision } from './user-source-ordering.policy.ts';
export type {
  CreateUser,
  CreateUserCommand,
  FollowUserSourceField,
  FollowUserSourceFieldCommand,
  ObserveUserSource,
  ObserveUserSourceCommand,
  RecordUserConsent,
  RecordUserConsentCommand,
  ResolveUserSource,
  SourceRevision,
  UpdateUser,
  UpdateUserCommand,
  UserCommandResult,
  UserConsentResult,
  UserFieldAuthority,
  UserFieldName,
  UserProfile,
  UserRecord,
  UserSourceIdentity,
  UserSourceObservation,
  UserSourceObservationResult,
} from './users.port.ts';
