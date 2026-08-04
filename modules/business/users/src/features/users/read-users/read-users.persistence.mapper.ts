import type * as schema from '@pressly/db/schema/users';
import type { UserSummary } from './read-users.model.ts';

const userDisplayName = (row: {
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
}): string => {
  const business = row.businessName?.trim();
  if (business !== undefined && business !== '') return business;

  const person = [row.firstName, row.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
  return person === '' ? 'Unnamed customer' : person;
};

export const mapStoredUserSummary = (
  row: typeof schema.users.$inferSelect,
  possibleDuplicateCount: number,
): UserSummary => ({
  id: row.id,
  businessId: row.businessId,
  version: row.version,
  active: row.active,
  firstName: row.firstName,
  lastName: row.lastName,
  businessName: row.businessName,
  phone: row.phone,
  email: row.email,
  displayName: userDisplayName(row),
  possibleDuplicateCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
