export type ReplaceShiftOrderSelectionCommand = Readonly<{
  locationId: string;
  productionShiftId: string;
  selectedOrderIds: readonly string[];
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type ProductionShiftSelection = Readonly<{
  productionShiftId: string;
  version: number;
  selectedOrderIds: readonly string[];
}>;

export type ReplaceShiftOrderSelectionResult = Readonly<{
  selection: ProductionShiftSelection;
  supersededScheduleRunId: string | null;
  replayed: boolean;
}>;
