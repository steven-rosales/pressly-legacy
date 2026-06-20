export type Brand<A, Name extends string> = A & Readonly<{ __brand: Name }>;

export type InstantMs = Brand<number, 'instantMs'>;
export type UtcIso = Brand<string, 'UtcIso'>;

export type ZoneId = 'UTC' | 'America/New_York' | (string & {});

export type WallDateTime = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  millisecond?: number;
}>;

export type NormalizedWallDateTime = Required<WallDateTime>;

export type WallDisambiguation = 'reject' | 'earlier' | 'later';

export type TimeError = Readonly<
  | { tag: 'InvalidUtcIso'; value: string }
  | { tag: 'InvalidWallDateTime'; value: WallDateTime }
  | {
      tag: 'NonexistentWallDateTime';
      zone: ZoneId;
      value: NormalizedWallDateTime;
    }
  | {
      tag: 'AmbiguousWallDateTime';
      zone: ZoneId;
      value: NormalizedWallDateTime;
      candidates: readonly UtcIso[];
    }
>;
