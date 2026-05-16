import { permissionError } from '@pressly/errors';
import type { Actor } from './actor.ts';
import type { Permission } from './permission.ts';

export const can = (actor: Actor, permission: Permission): boolean =>
  actor.permissions.includes(permission);

export const assertCan = (actor: Actor, permission: Permission): void => {
  if (can(actor, permission)) return;

  throw permissionError({
    code: 'missing_permission',
    message: `Actor ${actor.id} is missing permission ${permission}`,
    safeMessage: 'You do not have permission to perform this action',
  });
};
