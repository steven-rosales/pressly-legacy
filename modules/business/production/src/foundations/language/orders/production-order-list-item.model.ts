export type ProductionOrderStatus =
  | 'release_pending'
  | 'intake_pending'
  | 'eligible'
  | 'ineligible'
  | 'scheduled'
  | 'finished';

export type ProductionOrderDueBucket =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'later';

export type ProductionBagCountProvenance =
  | 'external_source'
  | 'operator_intake';

export type ProductionOrderListItem = Readonly<{
  id: string;
  locationId: string;
  externalOrderId: string;
  dueAt: Date;
  dueBucket: ProductionOrderDueBucket;
  priority: boolean;
  status: ProductionOrderStatus;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountProvenance: ProductionBagCountProvenance | null;
  intakeVersion: number | null;
  version: number;
}>;
