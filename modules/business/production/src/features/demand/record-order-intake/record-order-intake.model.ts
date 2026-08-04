export type RecordOrderIntakeCommand = Readonly<{
  locationId: string;
  orderId: string;
  bagCount: number;
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type RecordOrderIntakeResult = Readonly<{
  locationId: string;
  orderId: string;
  bagCount: number;
  bagCountProvenance: 'operator_intake';
  intakeVersion: number;
  version: number;
  replayed: boolean;
}>;
