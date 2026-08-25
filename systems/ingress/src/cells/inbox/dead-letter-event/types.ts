import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../../model/inbox.ts';

export const deadLetterEventOperationId =
  'ingress.dead-letter-event.v1' as const;
export type DeadLetterEventCommand = Readonly<
  WebhookEventClaim & { code: string; message: string }
>;
export type DeadLetterEventExpectedFailure = never;
export type DeadLetterEventRepository = Readonly<{
  deadLetter: (
    command: DeadLetterEventCommand,
  ) => Promise<WebhookEventCompletion>;
}>;
