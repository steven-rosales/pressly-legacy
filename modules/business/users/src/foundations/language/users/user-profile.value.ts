export type UserProfile = Readonly<{
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
}>;

export type UserFieldName = keyof UserProfile;
