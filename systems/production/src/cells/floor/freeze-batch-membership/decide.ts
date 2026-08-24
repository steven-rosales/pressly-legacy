import type {
  FreezeBatchMembershipCommand,
  FreezeBatchMembershipDecision,
  FreezeBatchMembershipFacts,
  FreezeBatchMembershipPolicy,
} from './types.ts';

export const freezeBatchMembershipOperationId =
  'production.freeze-batch-membership.v1' as const;

const reject = (
  kind: 'conflict' | 'not_found',
  code: string,
  message: string,
): FreezeBatchMembershipDecision => ({
  kind: 'reject',
  failure: { kind, code, message, safeMessage: message },
});

export const decideFreezeBatchMembership = (input: {
  command: FreezeBatchMembershipCommand;
  facts: FreezeBatchMembershipFacts | null;
  policy: FreezeBatchMembershipPolicy;
}): FreezeBatchMembershipDecision => {
  if (input.facts === null)
    return reject(
      'not_found',
      'production_batch_not_found',
      'The production batch was not found in this run.',
    );
  if (input.facts.productionRun.status !== 'started')
    return reject(
      'conflict',
      'production_run_not_started',
      'Batch membership can only change on a started production run.',
    );
  if (
    input.facts.productionRun.queueVersion !==
    input.command.expectedQueueVersion
  )
    return reject(
      'conflict',
      'production_queue_version_conflict',
      'The production queue changed before the command.',
    );
  if (
    input.facts.productionBatch.version !== input.command.expectedBatchVersion
  )
    return reject(
      'conflict',
      'production_batch_version_conflict',
      'The production batch changed before the command.',
    );

  const decision = input.policy.evaluateBatchMembershipTransition({
    action: 'freeze',
    batchStatus: input.facts.productionBatch.status,
    membershipFrozen: input.facts.productionBatch.membershipFrozenAt !== null,
    authorizedAction: 'production:queue',
  });
  return decision.tag === 'err'
    ? reject(
        'conflict',
        decision.error.code.toLowerCase(),
        decision.error.message,
      )
    : { kind: 'commit' };
};
