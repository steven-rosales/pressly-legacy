import type { UserSummary, UserSummarySource } from './user-summary.model.ts';

const userDisplayName = (user: UserSummarySource): string => {
  const business = user.businessName?.trim();
  if (business !== undefined && business !== '') return business;

  const person = [user.firstName, user.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');

  return person === '' ? 'Unnamed customer' : person;
};

export const projectUserSummary = (
  source: UserSummarySource,
  possibleDuplicateCount: number,
): UserSummary => ({
  ...source,
  displayName: userDisplayName(source),
  possibleDuplicateCount,
});
