export const listOrdersOperationId = 'production.list-orders.v1' as const;

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

export type ListOrdersInput = Readonly<{
  locationId: string;
  status?: ProductionOrderStatus;
  dueAfter?: Date;
  dueBefore?: Date;
  cursor?: string;
  limit: number;
}>;

export type ProductionOrderPersistenceRow = Readonly<{
  id: string;
  locationId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  status: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountSource: string | null;
  intakeVersion: number;
  version: number;
}>;

export type ProductionOrder = Readonly<{
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

export type ProductionOrdersPage = Readonly<{
  items: readonly ProductionOrder[];
  nextCursor: string | null;
  asOf: Date;
}>;

export type ListOrdersRepositoryResult =
  | Readonly<{ kind: 'found'; page: ProductionOrdersPage }>
  | Readonly<{ kind: 'invalid_cursor' }>
  | Readonly<{ kind: 'location_not_found' }>;

export type ListOrdersRepository = Readonly<{
  list: (
    input: ListOrdersInput,
    asOf: Date,
  ) => Promise<ListOrdersRepositoryResult>;
}>;

export type ListOrdersClock = Readonly<{ now: () => Date }>;

export type ListOrdersLocationNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_location_not_found';
  message: 'The production location was not found.';
  safeMessage: 'The production location was not found.';
}>;

export type ListOrdersCursorInvalid = Readonly<{
  tag: 'ProductionFailure';
  kind: 'validation';
  classification: 'malformed';
  code: 'production_order_cursor_invalid';
  message: 'The production-order cursor is invalid.';
  safeMessage: 'The production-order cursor is invalid.';
}>;

export type ListOrdersExpectedFailure =
  | ListOrdersCursorInvalid
  | ListOrdersLocationNotFound;
