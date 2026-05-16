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
