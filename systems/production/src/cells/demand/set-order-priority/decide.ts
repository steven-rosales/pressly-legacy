import type {
  SetOrderPriorityCommand,
  SetOrderPriorityDecision,
  SetOrderPriorityFacts,
  SetOrderPriorityPolicy,
} from './types.ts';

export const setOrderPriorityOperationId =
  'production.set-order-priority.v1' as const;

const conflict = (code: string, message: string): SetOrderPriorityDecision => ({
  kind: 'reject',
  failure: { kind: 'conflict', code, message, safeMessage: message },
});

export const decideSetOrderPriority = (input: {
  command: SetOrderPriorityCommand;
  facts: SetOrderPriorityFacts | null;
  policy: SetOrderPriorityPolicy;
}): SetOrderPriorityDecision => {
  if (input.facts === null)
    return {
      kind: 'reject',
      failure: {
        kind: 'not_found',
        code: 'production_order_not_found',
        message: 'The production order was not found.',
        safeMessage: 'The production order was not found.',
      },
    };

  if (input.facts.version !== input.command.expectedVersion)
    return conflict(
      'production_order_version_conflict',
      'The order changed before priority could be updated.',
    );

  const access = input.policy.evaluateProductionOrderOperationalAccess({
    resolutionState: input.facts.resolutionState,
  });
  if (access.tag === 'err')
    return conflict(access.error.code.toLowerCase(), access.error.message);

  return { kind: 'commit' };
};
