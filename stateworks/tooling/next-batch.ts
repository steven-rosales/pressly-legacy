import {
  applyState,
  findNextBatch,
  formatIssues,
  loadNetworkFile,
  loadStateFile,
  validateNetwork,
} from './model.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const stateIndex = args.indexOf('--state');
const statePath = stateIndex >= 0 ? args[stateIndex + 1] : undefined;
const networkPath = args.find((arg, index) => {
  if (arg.startsWith('--')) {
    return false;
  }

  return index === 0 || args[index - 1] !== '--state';
});

if (!networkPath || networkPath === '--help') {
  console.error(
    'Usage: pnpm stateworks:next <network.yaml> [--state state.yaml] [--json]',
  );
  process.exit(2);
}

const network = applyState(
  await loadNetworkFile(networkPath),
  await loadStateFile(statePath),
);
const validation = validateNetwork(network);

if (validation.errors.length > 0) {
  console.error(formatIssues(validation));
  process.exit(1);
}

const batch = findNextBatch(network);

if (json) {
  console.log(JSON.stringify(batch, null, 2));
  process.exit(0);
}

if (batch.length === 0) {
  console.log('No ready tasks.');
  process.exit(0);
}

console.log('Next compatible batch:');

for (const task of batch) {
  console.log(
    `- ${task.id}: ${task.title} [${task.type}, ${task.owner ?? 'agent'}, ${
      task.surface ?? 'repo'
    }]`,
  );
}
