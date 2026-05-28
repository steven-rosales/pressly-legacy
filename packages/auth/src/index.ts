export { can, assertCan } from './assert-can.ts';
export { actorFromPrincipal, makeActor } from './actor.ts';
export { allowDecision, denyDecision } from './decision.ts';
export { normalizeEmail } from './identity.ts';
export { principalLabel } from './principal.ts';
export { isRole, permissionsForRole, selectHighestRole } from './permission.ts';
export { allow, authorize, freshSession } from './policy.ts';
export { resolveCliActor } from './resolve-cli-actor.ts';
export {
  isSessionExpired,
  isSessionRevoked,
  sessionAgeMinutes,
} from './session.ts';
export { validatePasswordStrength } from './password.ts';

export type { Action } from './action.ts';
export type { Actor } from './actor.ts';
export type { AuthDecision, AuthDenyReason } from './decision.ts';
export type { Identity, IdentityKind } from './identity.ts';
export type { Principal } from './principal.ts';
export type { Permission, Role } from './permission.ts';
export type { AuthContext, PolicyCondition, PolicyRule } from './policy.ts';
export type { Session } from './session.ts';
export type { PasswordStrengthViolation } from './password.ts';
