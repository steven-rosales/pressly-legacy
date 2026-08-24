import { presslyTopology } from '../pressly.topology.ts';
import {
  compileTopology,
  explainOperation,
  formatArchitectureExplanation,
} from '../src/public.ts';
import {
  formatTopologyViolations,
  presslyRepositoryRoot,
} from './filesystem-artifacts.ts';
import { resolveRepositoryOperationEvidence } from './repository-operation-evidence.ts';

const operationId = process.argv.slice(2).find((argument) => argument !== '--');
if (operationId === undefined || operationId.trim().length === 0) {
  console.error(
    'Usage: pnpm --filter @pressly/topology explain -- <operation-id>',
  );
  process.exitCode = 2;
} else {
  const compilation = compileTopology(presslyTopology);
  if (compilation.kind === 'invalid') {
    console.error(formatTopologyViolations(compilation.violations));
    process.exitCode = 1;
  } else {
    const evidence = resolveRepositoryOperationEvidence(
      compilation.topology,
      presslyRepositoryRoot,
    );
    if (evidence.kind === 'invalid') {
      console.error(formatTopologyViolations(evidence.violations));
      process.exitCode = 1;
    } else {
      const result = explainOperation(
        compilation.topology,
        operationId,
        evidence.operations,
      );
      if (result.kind === 'not-found') {
        console.error(`Unknown operation: ${result.operationId}`);
        process.exitCode = 1;
      } else console.log(formatArchitectureExplanation(result.explanation));
    }
  }
}
