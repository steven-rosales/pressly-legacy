export type IdSource<Id extends string = string> = Readonly<{
  next: () => Id;
}>;
