export type IdentityKind = 'human' | 'service';

export type Identity = Readonly<{
  id: string;
  kind: IdentityKind;
  displayName: string;
  email?: string;
  isActive: boolean;
}>;

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
