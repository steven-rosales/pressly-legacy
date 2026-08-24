export type SessionInventoryItem = Readonly<{
  id: string;
  issuedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}>;

export type SessionInventory = Readonly<{
  sessions: readonly SessionInventoryItem[];
}>;
