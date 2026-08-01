export type UserCommandResult = Readonly<{
  userId: string;
  version: number;
  replayed: boolean;
}>;

export type UserClockPort = Readonly<{ now: () => Date }>;
