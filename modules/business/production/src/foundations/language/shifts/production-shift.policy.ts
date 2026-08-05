import type { ProductionShift } from './production-shift.entity.ts';

export type MutableProductionShiftFields = Readonly<{
  startsAt: string;
  endsAt: string;
  effectiveFolderCount: number;
}>;

export const isProductionShiftWindowValid = (
  window: Pick<MutableProductionShiftFields, 'startsAt' | 'endsAt'>,
): boolean => Date.parse(window.endsAt) > Date.parse(window.startsAt);

export const changedProductionShiftFields = (
  current: ProductionShift,
  desired: MutableProductionShiftFields,
): readonly (keyof MutableProductionShiftFields)[] => [
  ...(Date.parse(current.startsAt) === Date.parse(desired.startsAt)
    ? []
    : (['startsAt'] as const)),
  ...(Date.parse(current.endsAt) === Date.parse(desired.endsAt)
    ? []
    : (['endsAt'] as const)),
  ...(current.effectiveFolderCount === desired.effectiveFolderCount
    ? []
    : (['effectiveFolderCount'] as const)),
];
