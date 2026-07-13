import { writeFile } from 'node:fs/promises';
import {
  buildContextPack,
  formatIssues,
  loadDomainMemory,
  resolveDomainMemoryPaths,
  validateDomainMemory,
} from './memory-model.js';

const args = process.argv.slice(2);
const stdout = args.includes('--stdout');
const domainId = args.find((arg) => !arg.startsWith('--'));

if (!domainId || domainId === '--help') {
  console.error('Usage: pnpm stateworks:memory:context <domain-id> [--stdout]');
  process.exit(2);
}

const paths = await resolveDomainMemoryPaths(domainId);
const memory = await loadDomainMemory(paths.memoryPath);
const validation = validateDomainMemory(memory);

if (validation.errors.length > 0) {
  console.error(formatIssues(validation));
  process.exit(1);
}

const contextPack = buildContextPack(memory);

if (stdout) {
  console.log(contextPack.trimEnd());
  process.exit(0);
}

if (!paths.contextPackPath) {
  console.error(`domain ${domainId} has no default_context_pack`);
  process.exit(1);
}

await writeFile(paths.contextPackPath, contextPack, 'utf8');

console.log(`Stateworks context pack written: ${paths.contextPackPath}`);
console.log(`domain_id: ${memory.domain_id}`);
