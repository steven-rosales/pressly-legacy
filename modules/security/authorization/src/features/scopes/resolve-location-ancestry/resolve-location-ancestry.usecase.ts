import type { LocationAncestryPort } from '../../../foundations/ports/location-ancestry/location-ancestry.port.ts';
import type { ResolvedLocationAncestry } from './resolve-location-ancestry.model.ts';

export type ResolveLocationAncestry = (
  locationId: string,
) => Promise<ResolvedLocationAncestry>;

export const makeResolveLocationAncestry =
  (
    ancestry: Pick<LocationAncestryPort, 'resolveBusinessId'>,
  ): ResolveLocationAncestry =>
  async (locationId) => ({
    locationId,
    businessId: await ancestry.resolveBusinessId(locationId),
  });
