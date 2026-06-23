export type { Action } from './action.ts';

export type { RoleAssignment } from './assignment.ts';
export { isAssignmentActive } from './assignment.ts';

export type { AuthDecision, AuthDenyReason } from './decision.ts';
export {
  allowDecision,
  denyDecision,
  isAllowed,
  isDenied,
} from './decision.ts';

export type { AuthEnvironment } from './environment.ts';

export type {
  AuthorizationRequest,
  PolicyCondition,
  PolicyInput,
  PolicyRule,
} from './policy.ts';
export { allow, authorize, deny } from './policy.ts';

export type { PrincipalAttributes } from './principal-attributes.ts';
export { principalAttributesFromSession } from './principal-attributes.ts';

export type { AuthResource } from './resource.ts';

export type { Role } from './role.ts';
export { isRole } from './role.ts';

export type { Scope } from './scope.ts';
export {
  globalScope,
  locationScope,
  resourceScope,
  scopeCovers,
  scopeKey,
} from './scope.ts';

export { freshSession } from './conditions/fresh-session.ts';
export { hasScopedRole } from './conditions/scoped-role.ts';
export { sameIdentity } from './conditions/same-identity.ts';
