import { describe, expect, it } from 'vitest';
import { evaluateProductionBatchTransition } from './lifecycles/batch.ts';
import { evaluateProductionOrderExecutionTransition } from './lifecycles/order-execution.ts';
import { evaluateStageTransition, productionStageGraph } from './stage.ts';
import { defineProductionRules, productionRules } from './rules.ts';

describe('production rules', () => {
  it('publishes one frozen canonical rule vocabulary', () => {
    expect(Object.isFrozen(productionRules)).toBe(true);
    expect(productionRules.evaluateStageTransition).toBe(
      evaluateStageTransition,
    );
    expect(productionRules.evaluateProductionBatchTransition).toBe(
      evaluateProductionBatchTransition,
    );
    expect(productionRules.evaluateProductionOrderExecutionTransition).toBe(
      evaluateProductionOrderExecutionTransition,
    );
    expect(productionRules.stageGraph).toBe(productionStageGraph);
  });

  it('preserves the exact policy function identities across compilations', () => {
    const compiled = defineProductionRules();

    expect(compiled).not.toBe(productionRules);
    for (const key of Object.keys(productionRules) as Array<
      keyof typeof productionRules
    >)
      expect(compiled[key]).toBe(productionRules[key]);
  });
});
