import type { WorkforceCursor } from '../../../../foundations/language/workforce-pagination/workforce-cursor.value.ts';
import type {
  StoreFailureReason,
  WorkforceActorRef,
} from '../../../../foundations/language/workforce/workforce.model.ts';

export type WorkforceSecurityEventSummary = Readonly<{
  id: string;
  eventType: string;
  resourceType: string;
  actorDisplayName: string | null;
  createdAt: Date;
}>;

export type ListWorkforceSecurityEventsStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  limit: number;
  cursor?: WorkforceCursor;
  now: Date;
}>;

export type ListWorkforceSecurityEventsStoreResult =
  | Readonly<{
      status: 'found';
      events: readonly WorkforceSecurityEventSummary[];
      nextCursor: string | null;
    }>
  | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>;

export type ListWorkforceSecurityEventsStore = Readonly<{
  listSecurityEvents: (
    input: ListWorkforceSecurityEventsStoreInput,
  ) => Promise<ListWorkforceSecurityEventsStoreResult>;
}>;
