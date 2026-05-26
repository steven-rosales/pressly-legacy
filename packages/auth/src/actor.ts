import type { Principal } from './principal.ts';
import type { Permission, Role } from './permission.ts';
import { permissionsForRole } from './permission.ts';

export type ActorKind = 'user' | 'service';

export type Actor = Readonly<{
  id: string;
  kind: ActorKind;
  displayName: string;
  role: Role;
  permissions: readonly Permission[];
}>;

export const makeActor = (input: Omit<Actor, 'permissions'>): Actor => ({
  id: input.id,
  kind: input.kind,
  displayName: input.displayName,
  role: input.role,
  permissions: permissionsForRole(input.role),
});

export const actorFromPrincipal = (input: {
  principal: Principal;
  role: Role;
}): Actor =>
  makeActor({
    id: input.principal.identityId,
    kind: input.principal.kind === 'service' ? 'service' : 'user',
    displayName: input.principal.displayName,
    role: input.role,
  });
