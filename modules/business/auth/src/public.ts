export { makeAuthModule } from './main.ts';
export type { AuthModule, AuthModuleDeps } from './main.ts';
export type { AuthLocals } from './adapters/load-session/http/authenticate.middleware.ts';
export type {
  AuthorizeMiddlewareFactory,
  AuthorizeMiddlewareInput,
} from './adapters/load-session/http/authorize.middleware.ts';
export {
  makeSessionAdministrationRouter,
  type SessionAdministrationSecurity,
} from './adapters/administer-sessions/http/administer-sessions.route.ts';
export {
  makeMfaAdministrationRouter,
  type MfaRouteSecurity,
} from './adapters/mfa/http/mfa.route.ts';
