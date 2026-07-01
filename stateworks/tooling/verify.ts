import {
  applyState,
  findNextBatch,
  formatIssues,
  loadNetworkFile,
  loadStateFile,
  validateNetwork,
  verifyLifecycle,
} from './model.js';

const args = process.argv.slice(2);
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
    'Usage: pnpm stateworks:verify <network.yaml> [--state state.yaml]',
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

if (validation.warnings.length > 0) {
  console.warn(formatIssues({ errors: [], warnings: validation.warnings }));
}

const lifecycle = verifyLifecycle(network);
const nextBatch = findNextBatch(network);

console.log(`Stateworks verification: ${network.work_id}`);
console.log(`done: ${lifecycle.done ? 'yes' : 'no'}`);
console.log(
  `stop_reasons: ${
    lifecycle.stopReasons.length > 0 ? lifecycle.stopReasons.join(', ') : 'none'
  }`,
);
console.log(`next_ready_tasks: ${nextBatch.length}`);

for (const task of lifecycle.humanBlockedTasks) {
  console.log(`human: ${task.id} ${task.title}`);
}

for (const task of lifecycle.repeatedFailures) {
  console.log(`repeated_failure: ${task.id} ${task.title}`);
}

for (const task of lifecycle.invalidatedTasks) {
  console.log(`invalidated: ${task.id} ${task.title}`);
}

for (const task of lifecycle.destructiveTasks) {
  console.log(`destructive: ${task.id} ${task.title}`);
}
