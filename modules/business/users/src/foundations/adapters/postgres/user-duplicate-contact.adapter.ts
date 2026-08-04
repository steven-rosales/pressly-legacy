import { type DatabaseExecutor } from '@pressly/db/client';
import { and, eq, ne } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/users';
import type { UserProfile } from '../../language/users/user-profile.value.ts';

export const signalDuplicateUserContacts = async (
  db: DatabaseExecutor,
  input: {
    businessId: string;
    userId: string;
    profile: UserProfile;
    now: Date;
  },
): Promise<void> => {
  const candidates = new Map<string, Set<string>>();
  const record = (candidateId: string, reason: string): void => {
    const reasons = candidates.get(candidateId) ?? new Set<string>();
    reasons.add(reason);
    candidates.set(candidateId, reasons);
  };

  if (input.profile.phone !== null) {
    const matches = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.businessId, input.businessId),
          eq(schema.users.phone, input.profile.phone),
          ne(schema.users.id, input.userId),
        ),
      );
    for (const match of matches) record(match.id, 'same_phone');
  }

  if (input.profile.email !== null) {
    const matches = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.businessId, input.businessId),
          eq(schema.users.email, input.profile.email),
          ne(schema.users.id, input.userId),
        ),
      );
    for (const match of matches) record(match.id, 'same_email');
  }

  const rows = [...candidates.entries()].flatMap(([candidateUserId, reasons]) =>
    [...reasons].map((reason) => ({
      userId: input.userId,
      candidateUserId,
      reason,
      status: 'open',
      resolvedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    })),
  );

  if (rows.length > 0)
    await db
      .insert(schema.userDuplicateCandidates)
      .values(rows)
      .onConflictDoNothing();
};
