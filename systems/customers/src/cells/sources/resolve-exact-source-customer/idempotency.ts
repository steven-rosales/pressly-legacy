import { canonicalSha256 } from '@pressly/codec/node';
import type { ResolveExactSourceCustomerCommand } from './types.ts';

export const resolveExactSourceCustomerCommandHash = (
  command: ResolveExactSourceCustomerCommand,
): string =>
  canonicalSha256({
    businessId: command.businessId,
    idempotencyKey: command.idempotencyKey,
    context: command.context,
    profile: command.profile,
  });
