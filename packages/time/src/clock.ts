export type Clock = Readonly<{
  now: () => Date;
}>;

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
});
