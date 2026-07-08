import {
  applyAcceptedMemoryDelta,
  formatIssues,
  loadDomainMemory,
  loadMemoryDelta,
  resolveDomainMemoryPaths,
  validateDomainMemory,
  validateMemoryDelta,
  writeYamlFile,
} from './memory-model.js';

const deltaPath = process.argv[2];

if (!deltaPath || deltaPath === '--help') {
  console.error(
    'Usage: pnpm stateworks:memory:apply <delta.memory-delta.yaml>',
  );
  process.exit(2);
}

const delta = await loadMemoryDelta(deltaPath);
const deltaValidation = validateMemoryDelta(delta);

if (deltaValidation.errors.length > 0) {
  console.error(formatIssues(deltaValidation));
  process.exit(1);
}

const paths = await resolveDomainMemoryPaths(delta.domain_id);
const memory = await loadDomainMemory(paths.memoryPath);
const memoryValidation = validateDomainMemory(memory);

if (memoryValidation.errors.length > 0) {
  console.error(formatIssues(memoryValidation));
  process.exit(1);
}

const nextMemory = applyAcceptedMemoryDelta(memory, delta);
const nextValidation = validateDomainMemory(nextMemory);

if (nextValidation.errors.length > 0) {
  console.error(formatIssues(nextValidation));
  process.exit(1);
}

await writeYamlFile(paths.memoryPath, nextMemory);

console.log(`Stateworks memory delta applied: ${delta.id}`);
console.log(`domain_id: ${delta.domain_id}`);
console.log(`memory: ${paths.memoryPath}`);
