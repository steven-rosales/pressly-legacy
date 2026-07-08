import {
  formatIssues,
  loadDomainMemory,
  loadMemoryDelta,
  validateDomainMemory,
  validateMemoryDelta,
} from './memory-model.js';

const memoryPath = process.argv[2];

if (!memoryPath || memoryPath === '--help') {
  console.error(
    'Usage: pnpm stateworks:memory:validate <memory.yaml|memory-delta.yaml>',
  );
  process.exit(2);
}

const isDelta =
  memoryPath.endsWith('.memory-delta.yaml') ||
  memoryPath.endsWith('/memory-delta.yaml') ||
  memoryPath.endsWith('\\memory-delta.yaml');

if (isDelta) {
  const delta = await loadMemoryDelta(memoryPath);
  const validation = validateMemoryDelta(delta);

  if (validation.errors.length > 0) {
    console.error(formatIssues(validation));
    process.exit(1);
  }

  if (validation.warnings.length > 0) {
    console.warn(formatIssues({ errors: [], warnings: validation.warnings }));
  }

  console.log(`Stateworks memory valid: ${memoryPath}`);
  console.log(`delta_id: ${delta.id}`);
  console.log(`domain_id: ${delta.domain_id}`);
  process.exit(0);
}

const memory = await loadDomainMemory(memoryPath);
const validation = validateDomainMemory(memory);

if (validation.errors.length > 0) {
  console.error(formatIssues(validation));
  process.exit(1);
}

if (validation.warnings.length > 0) {
  console.warn(formatIssues({ errors: [], warnings: validation.warnings }));
}

console.log(`Stateworks memory valid: ${memoryPath}`);
console.log(`domain_id: ${memory.domain_id}`);
console.log(`version: ${memory.version}`);
