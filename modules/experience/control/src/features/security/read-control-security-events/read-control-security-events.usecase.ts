import type { Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type { ControlSecurityEventList } from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type {
  ControlWorkforcePort,
  ControlWorkforceRejection,
} from '../../../foundations/ports/control-workforce/control-workforce.port.ts';

export type ReadControlSecurityEvents = (input: {
  context: ControlRequestContext;
  cursor?: string;
  limit: number;
}) => Promise<Result<ControlSecurityEventList, ControlWorkforceRejection>>;

export const makeReadControlSecurityEvents =
  (workforce: ControlWorkforcePort): ReadControlSecurityEvents =>
  async ({ context, ...query }) => {
    const events = await workforce.listSecurityEvents({
      ...query,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return events;
  };
