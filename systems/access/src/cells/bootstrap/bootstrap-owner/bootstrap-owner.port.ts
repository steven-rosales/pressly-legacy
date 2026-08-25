export type CreateBootstrapOwnerInput = Readonly<{
  businessId: string;
  businessSlug: string;
  businessDisplayName: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  verifyExistingPassword: (passwordHash: string) => Promise<boolean>;
}>;

export type BootstrapOwnerStoreResult =
  | Readonly<{
      status: 'created';
      identityId: string;
    }>
  | Readonly<{
      status: 'replayed';
      identityId: string;
    }>
  | Readonly<{ status: 'owner_exists' }>
  | Readonly<{ status: 'identity_exists' }>
  | Readonly<{ status: 'business_conflict' }>
  | Readonly<{ status: 'credential_conflict' }>;

export type BootstrapOwnerStore = Readonly<{
  createFirstOwner: (
    input: CreateBootstrapOwnerInput,
  ) => Promise<BootstrapOwnerStoreResult>;
}>;
