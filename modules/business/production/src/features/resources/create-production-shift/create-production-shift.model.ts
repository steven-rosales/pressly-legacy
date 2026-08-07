export type CreateProductionShiftCommand = Readonly<{
  locationId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  effectiveFolderCount: number;
  idempotencyKey: string;
}>;
