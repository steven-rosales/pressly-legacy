import {
  formatTopologyViolations,
  presslyRepositoryRoot,
  resolvePresslyArtifacts,
  writeGeneratedArtifacts,
} from './filesystem-artifacts.ts';

const resolution = await resolvePresslyArtifacts();
if (resolution.kind !== 'ready') {
  console.error(formatTopologyViolations(resolution.violations));
  process.exitCode = 1;
} else {
  const written = writeGeneratedArtifacts(
    presslyRepositoryRoot,
    resolution.artifacts,
  );
  for (const path of written) console.log(path);
}
