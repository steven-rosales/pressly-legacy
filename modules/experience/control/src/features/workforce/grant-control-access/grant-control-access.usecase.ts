import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlWorkforceRejection } from '../../../foundations/language/control-workforce/control-workforce.failure.ts';
import type { ControlGrant } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import { toControlGrant } from '../../../foundations/language/control-workforce/control-workforce.projection.ts';
import type {
  ControlWorkforceRole,
  ControlWorkforceScope,
} from '../../../foundations/language/control-workforce/control-workforce.value.ts';
import type { GrantControlAccessPort } from './grant-control-access.port.ts';

export type GrantControlAccess = (input: {
  context: ControlRequestContext;
  membershipId: string;
  identityId: string;
  role: ControlWorkforceRole;
  scope: ControlWorkforceScope;
  startsAt?: string;
  endsAt?: string;
  idempotencyKey: string;
}) => Promise<Result<ControlGrant, ControlWorkforceRejection>>;

export const makeGrantControlAccess =
  (grantAccess: GrantControlAccessPort): GrantControlAccess =>
  async ({ context, startsAt, endsAt, ...command }) => {
    const granted = await grantAccess({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
      ...(startsAt === undefined ? {} : { startsAt: new Date(startsAt) }),
      ...(endsAt === undefined ? {} : { endsAt: new Date(endsAt) }),
    });
    return result.isErr(granted)
      ? granted
      : result.ok(toControlGrant(granted.value));
  };
