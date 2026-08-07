export type ChangeProductionAdmissionCommand = Readonly<{
  locationId: string;
  orderId: string;
  target: 'released' | 'source';
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type ChangeProductionAdmissionResult = Readonly<{
  locationId: string;
  orderId: string;
  admissionOverride: 'released' | null;
  status:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
  version: number;
  replayed: boolean;
}>;
