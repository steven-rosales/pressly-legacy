export type CreateScheduleCommand = Readonly<{
  locationId: string;
  productionShiftId: string;
  schedulerConfigId: string;
  idempotencyKey: string;
  actorId: string;
}>;
