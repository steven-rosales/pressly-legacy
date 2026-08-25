import {
  checkGeneratedArtifacts,
  formatTopologyViolations,
  presslyRepositoryRoot,
  resolvePresslyArtifacts,
} from './filesystem-artifacts.ts';

const resolution = await resolvePresslyArtifacts();
if (resolution.kind !== 'ready') {
  console.error(formatTopologyViolations(resolution.violations));
  process.exitCode = 1;
} else {
  const mismatches = checkGeneratedArtifacts(
    presslyRepositoryRoot,
    resolution.artifacts,
  );
  if (mismatches.length > 0) {
    for (const mismatch of mismatches)
      console.error(`- ${mismatch.path}: ${mismatch.reason}`);
    process.exitCode = 1;
  }
}
