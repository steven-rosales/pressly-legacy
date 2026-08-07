import { defineProductionAlgorithmRegistry } from './production-algorithm-registry.factory.ts';

/**
 * The executable Production algorithm set. Construction stays in the registry
 * factory; this frozen value is the only algorithm selection used at runtime.
 */
export const productionAlgorithms = defineProductionAlgorithmRegistry();
