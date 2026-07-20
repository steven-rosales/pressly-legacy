export type DemandForecastDisposition = 'expected' | 'ready';

export type DemandForecastInput = Readonly<{
  demand: readonly Readonly<{
    id: string;
    dueAt: string;
    priority: boolean;
    estimatedWeightLbs: number;
    disposition: DemandForecastDisposition;
  }>[];
  machines: readonly Readonly<{
    id: string;
    stationKind: 'washing' | 'drying';
    effectiveCapacityLbs: number;
    active: boolean;
  }>[];
  shift: Readonly<{
    startsAt: string;
    timezone: string;
    effectiveFolderCount: number;
  }>;
  config: Readonly<{
    pulseMinutes: number;
    foldLbsPerFolderMinute: number;
  }>;
}>;

export type DemandForecastOutput = Readonly<{
  algorithmVersion: 'fixed-pulse-demand-outlook-v1';
  startsAt: string;
  completesAt: string;
  pulseMinutes: number;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  batches: readonly Readonly<{
    sequence: number;
    demandIds: readonly string[];
    estimatedWeightLbs: number;
    expectedOrderCount: number;
    readyOrderCount: number;
  }>[];
  unplacedDemandIds: readonly string[];
}>;

export type ForecastDemand = (
  input: DemandForecastInput,
) => DemandForecastOutput;
