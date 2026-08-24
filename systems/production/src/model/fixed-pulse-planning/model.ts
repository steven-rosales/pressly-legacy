export const fixedPulseStages = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;

export type FixedPulseStageKind = (typeof fixedPulseStages)[number];

export type FixedPulseCapacityMachine = Readonly<{
  stationKind: 'washing' | 'drying';
  effectiveCapacityLbs: number;
  active: boolean;
}>;

export type FixedPulseMachine = FixedPulseCapacityMachine &
  Readonly<{ id: string }>;

export type FixedPulseItem<Value> = Readonly<{
  id: string;
  dueAt: string;
  priority: boolean;
  weightLbs: number;
  value: Value;
}>;

export type FixedPulseBatch<Value> = Readonly<{
  items: readonly FixedPulseItem<Value>[];
  weightLbs: number;
}>;

export type FixedPulseStage = Readonly<{
  stage: FixedPulseStageKind;
  startsAt: string;
  endsAt: string;
  machineIds: readonly string[];
}>;
