import { sha256Text } from '@pressly/codec/node';
import type { ProductionBootstrapManifest } from './manage-production-resources.model.ts';

const canonicalProductionBootstrapManifest = (
  manifest: ProductionBootstrapManifest,
) => ({
  ...manifest,
  stations: [...manifest.stations].sort((left, right) =>
    left.kind.localeCompare(right.kind),
  ),
  machines: [...manifest.machines].sort((left, right) =>
    `${left.stationKind}\0${left.label}`.localeCompare(
      `${right.stationKind}\0${right.label}`,
    ),
  ),
});

export const hashProductionBootstrapManifest = (
  manifest: ProductionBootstrapManifest,
): string =>
  sha256Text(JSON.stringify(canonicalProductionBootstrapManifest(manifest)));
