export type CreateBootstrapOwnerInput = Readonly<{
  businessId: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
}>;

export type BootstrapOwnerStoreResult =
  | Readonly<{
      status: 'created';
      identityId: string;
    }>
  | Readonly<{ status: 'owner_exists' }>
  | Readonly<{ status: 'identity_exists' }>;

export type BootstrapOwnerStore = Readonly<{
  createFirstOwner: (
    input: CreateBootstrapOwnerInput,
  ) => Promise<BootstrapOwnerStoreResult>;
}>;
