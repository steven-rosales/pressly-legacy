import type { JsonObject } from '@pressly/codec';
import type { DatabaseTransaction } from '@pressly/db/client';
import * as auth from '@pressly/db/schema/auth';

export const recordAudit = async (
  tx: DatabaseTransaction,
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
