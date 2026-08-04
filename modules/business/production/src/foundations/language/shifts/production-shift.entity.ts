export type ProductionShiftStatus = 'draft' | 'open' | 'closed';

/**
 * Shift timestamps remain canonical UTC strings because the entity is also
 * persisted in the work-event idempotency envelope. Rehydrating those values
 * as Date objects belongs at that persistence boundary, not in this entity.
 */
export type ProductionShift = Readonly<{
  id: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  effectiveFolderCount: number;
  status: ProductionShiftStatus;
  version: number;
}>;
