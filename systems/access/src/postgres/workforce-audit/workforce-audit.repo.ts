import type { JsonObject } from '@pressly/codec';
import type { PostgresTransaction } from '@pressly/postgres/client';
import type { AccessSchema } from '../../schema/public.ts';

export const recordAudit = async (
  tx: PostgresTransaction,
  auth: Pick<AccessSchema, 'authAuditEvents'>,
  input: {
    businessId: string;
    actorIdentityId: string;
    eventType: string;
    resourceType: string;
    resourceId: string;
    metadata?: JsonObject;
    now: Date;
  },
): Promise<void> => {
  await tx.insert(auth.authAuditEvents).values({
    businessId: input.businessId,
    principalIdentityId: input.actorIdentityId,
    eventType: input.eventType,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata ?? {},
    createdAt: input.now,
  });
};
