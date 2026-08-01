import type {
  UserFieldName,
  UserProfile,
  UserRecord,
} from './user-profile.port.ts';

export const userProfileFields = [
  'firstName',
  'lastName',
  'businessName',
  'phone',
  'email',
] as const satisfies readonly UserFieldName[];

export const userProfileFrom = (
  user: Pick<UserRecord, UserFieldName>,
): UserProfile => ({
  firstName: user.firstName,
  lastName: user.lastName,
  businessName: user.businessName,
  phone: user.phone,
  email: user.email,
});
