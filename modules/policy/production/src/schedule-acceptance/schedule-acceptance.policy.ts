import { result, type Result } from '@pressly/kernel';

type Rejection = Readonly<{ code: string; message: string }>;

export type ScheduleAcceptanceInput = Readonly<{
  expectedOutputPlanHash: string;
  actualOutputPlanHash: string;
  warningCodes: readonly string[];
  blockingWarningCodes: readonly string[];
  acknowledgedWarningCodes: readonly string[];
  batches: readonly Readonly<{
    weightLbs: number;
    capacityLbs: number;
    orderIds: readonly string[];
    stages: readonly Readonly<{
      stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
      startsAt: Date;
      endsAt: Date;
      pulseMinutes: number;
    }>[];
  }>[];
}>;

export const evaluateScheduleAcceptance = (
  input: ScheduleAcceptanceInput,
): Result<Readonly<{ accepted: true }>, Rejection> => {
  if (input.expectedOutputPlanHash !== input.actualOutputPlanHash)
    return result.err({
      code: 'SCHEDULE_HASH_MISMATCH',
      message: 'The schedule proposal changed before acceptance.',
    });

  if (
    new Set(input.acknowledgedWarningCodes).size !==
    input.acknowledgedWarningCodes.length
  )
    return result.err({
      code: 'SCHEDULE_WARNING_ACKNOWLEDGEMENT_INVALID',
      message: 'A schedule warning may be acknowledged only once.',
    });

  const unexpectedAcknowledgement = input.acknowledgedWarningCodes.find(
    (code) => !input.warningCodes.includes(code),
  );

  if (unexpectedAcknowledgement !== undefined)
    return result.err({
      code: 'SCHEDULE_WARNING_ACKNOWLEDGEMENT_INVALID',
      message: `Warning ${unexpectedAcknowledgement} is not present on this schedule.`,
    });

  const missingAcknowledgement = input.blockingWarningCodes.find(
    (code) => !input.acknowledgedWarningCodes.includes(code),
  );

  if (missingAcknowledgement !== undefined)
    return result.err({
      code: 'SCHEDULE_WARNING_NOT_ACKNOWLEDGED',
      message: `Blocking warning ${missingAcknowledgement} must be acknowledged.`,
    });

  if (input.batches.length === 0)
    return result.err({
      code: 'SCHEDULE_HAS_NO_BATCHES',
      message: 'An empty proposal cannot be accepted for Start.',
    });

  const seenOrders = new Set<string>();
  const expectedStages = [
    'sorting',
    'washing',
    'drying',
    'folding_packaging',
  ] as const;

  for (const batch of input.batches) {
    if (batch.weightLbs <= 0 || batch.weightLbs > batch.capacityLbs)
      return result.err({
        code: 'BATCH_CAPACITY_EXCEEDED',
        message: 'A proposed batch exceeds its pulse capacity.',
      });

    if (batch.stages.length !== 4)
      return result.err({
        code: 'BATCH_STAGE_COUNT_INVALID',
        message: 'Every production batch must contain exactly four stages.',
      });

    if (batch.orderIds.length === 0)
      return result.err({
        code: 'BATCH_HAS_NO_ORDERS',
        message: 'Every production batch must contain at least one order.',
      });

    for (const [index, stage] of batch.stages.entries()) {
      if (stage.stage !== expectedStages[index])
        return result.err({
          code: 'BATCH_STAGE_ORDER_INVALID',
          message: 'Batch stages must follow the production sequence.',
        });

      const minutes =
        (stage.endsAt.getTime() - stage.startsAt.getTime()) / 60_000;

      if (minutes !== stage.pulseMinutes)
        return result.err({
          code: 'STAGE_PULSE_MISMATCH',
          message: 'Every stage must occupy exactly one configured pulse.',
        });

      const previous = batch.stages[index - 1];
      if (
        previous !== undefined &&
        previous.endsAt.getTime() !== stage.startsAt.getTime()
      )
        return result.err({
          code: 'BATCH_STAGE_GAP_INVALID',
          message: 'Batch stages must form one contiguous four-pulse flow.',
        });
    }

    for (const orderId of batch.orderIds) {
      if (seenOrders.has(orderId))
        return result.err({
          code: 'ORDER_SPLIT_ACROSS_BATCHES',
          message: 'An order cannot appear in more than one production batch.',
        });

      seenOrders.add(orderId);
    }
  }

  return result.ok({ accepted: true });
};
