import type { UserFieldName } from './user-profile.value.ts';

export const userProfileFields = Object.freeze([
  'firstName',
  'lastName',
  'businessName',
  'phone',
  'email',
] as const satisfies readonly UserFieldName[]);
