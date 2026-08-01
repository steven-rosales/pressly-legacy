export type Transactional<Operations> = Readonly<{
  transaction: <T>(work: (operations: Operations) => Promise<T>) => Promise<T>;
}>;
