import type { WorkforceCursor } from '../../../../foundations/language/workforce-pagination/workforce-cursor.value.ts';
import type {
  StoreFailureReason,
  WorkforceActorRef,
} from '../../../../foundations/language/workforce/workforce.model.ts';
import type { WorkforcePage } from '../../../../foundations/language/workforce-membership/workforce-membership.model.ts';

export type ListWorkforceStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  states?: readonly ('active' | 'suspended' | 'ended')[];
  query?: string;
  limit: number;
  cursor?: WorkforceCursor;
  now: Date;
}>;

export type ListWorkforceStoreResult =
  | Readonly<{ status: 'found'; page: WorkforcePage }>
  | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>;

export type ListWorkforceStore = Readonly<{
  list: (input: ListWorkforceStoreInput) => Promise<ListWorkforceStoreResult>;
}>;
