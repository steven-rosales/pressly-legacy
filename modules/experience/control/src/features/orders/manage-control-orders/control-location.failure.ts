export type ControlLocationFailure = Readonly<{
  kind: 'location_not_found';
  requestedLocationId: string;
}>;

export const controlLocationNotFound = (
  requestedLocationId: string,
): ControlLocationFailure => ({
  kind: 'location_not_found',
  requestedLocationId,
});
