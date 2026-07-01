import { formatIssues, loadNetworkFile, validateNetwork } from './model.js';

const networkPath = process.argv[2];

if (!networkPath || networkPath === '--help') {
  console.error('Usage: pnpm stateworks:validate <network.yaml>');
  process.exit(2);
}

const network = await loadNetworkFile(networkPath);
const validation = validateNetwork(network);

if (validation.errors.length > 0) {
  console.error(formatIssues(validation));
  process.exit(1);
}

if (validation.warnings.length > 0) {
  console.warn(formatIssues({ errors: [], warnings: validation.warnings }));
}

console.log(`Stateworks network valid: ${networkPath}`);
console.log(`work_id: ${network.work_id}`);
console.log(`tasks: ${network.tasks.length}`);
