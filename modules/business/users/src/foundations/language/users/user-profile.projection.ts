import type { User } from './user.entity.ts';
import type { UserFieldName, UserProfile } from './user-profile.value.ts';

export const projectUserProfile = (
  user: Pick<User, UserFieldName>,
): UserProfile => ({
  firstName: user.firstName,
  lastName: user.lastName,
  businessName: user.businessName,
  phone: user.phone,
  email: user.email,
});
