export type ControlOrderRejection = Readonly<{
  kind: 'order_rejected';
  category:
    | 'validation'
    | 'authentication'
    | 'permission'
    | 'not_found'
    | 'conflict'
    | 'rate_limit';
  code: string;
  message: string;
  details?: Readonly<{
    currentVersion?: number;
    violations?: readonly string[];
  }>;
}>;

export type ControlLocationFailure = Readonly<{
  kind: 'location_not_found';
  requestedLocationId: string;
}>;

export type ControlOrderFailure =
  | ControlOrderRejection
  | ControlLocationFailure;

export const controlLocationNotFound = (
  requestedLocationId: string,
): ControlLocationFailure => ({
  kind: 'location_not_found',
  requestedLocationId,
});
