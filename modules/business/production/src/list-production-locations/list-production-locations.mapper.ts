import type { ProductionLocation } from '@pressly/contracts';

export type ProductionLocationRow = Readonly<{
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
}>;

export const mapProductionLocation = (
  row: ProductionLocationRow,
): ProductionLocation => ({
  id: row.id,
  name: row.name,
  timezone: row.timezone,
  isActive: row.isActive,
});
