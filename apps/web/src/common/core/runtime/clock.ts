export type Clock = Readonly<{ now: () => Date }>;

export const systemClock: Clock = { now: () => new Date() };
