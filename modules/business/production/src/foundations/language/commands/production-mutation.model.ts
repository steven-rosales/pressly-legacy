export type ProductionMutationResult = Readonly<{
  entityId: string;
  version: number;
  replayed: boolean;
}>;
