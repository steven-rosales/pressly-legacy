export type UserCommandResult = Readonly<{
  userId: string;
  version: number;
  replayed: boolean;
}>;

export type StoredUserCommandReceipt = Readonly<{
  commandHash: string;
  result: UserCommandResult;
}>;
