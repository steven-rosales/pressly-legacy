import { isJsonObject, type JsonObject } from '@pressly/codec';
import type { PostgresTransaction } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import type { AccessSchema } from '../../schema/public.ts';

type ReceiptCheck =
  | Readonly<{ status: 'new' }>
  | Readonly<{ status: 'conflict' }>
  | Readonly<{
      status: 'replayed';
      aggregateId: string;
      resultMetadata: JsonObject;
    }>;

export const checkReceipt = async (
  tx: PostgresTransaction,
  auth: Pick<AccessSchema, 'authCommandReceipts'>,
  idempotencyKey: string,
  commandHash: string,
): Promise<ReceiptCheck> => {
  const [receipt] = await tx
    .select({
      commandHash: auth.authCommandReceipts.commandHash,
      aggregateId: auth.authCommandReceipts.aggregateId,
      resultMetadata: auth.authCommandReceipts.resultMetadata,
    })
    .from(auth.authCommandReceipts)
    .where(eq(auth.authCommandReceipts.idempotencyKey, idempotencyKey))
    .limit(1);

  if (receipt === undefined) return { status: 'new' };
  if (receipt.commandHash !== commandHash) return { status: 'conflict' };
  if (!isJsonObject(receipt.resultMetadata))
    throw invariantViolationError({
      code: 'workforce_receipt_metadata_invalid',
      message: 'Stored workforce receipt metadata is not a JSON object.',
    });
  return {
    status: 'replayed',
    aggregateId: receipt.aggregateId,
    resultMetadata: receipt.resultMetadata,
  };
};

export const recordReceipt = async (
  tx: PostgresTransaction,
  auth: Pick<AccessSchema, 'authCommandReceipts'>,
  input: {
    idempotencyKey: string;
    businessId: string;
    aggregateKind: string;
    aggregateId: string;
    commandHash: string;
    actorIdentityId: string;
    resultMetadata: JsonObject;
    now: Date;
  },
): Promise<void> => {
  await tx.insert(auth.authCommandReceipts).values({
    idempotencyKey: input.idempotencyKey,
    businessId: input.businessId,
    aggregateKind: input.aggregateKind,
    aggregateId: input.aggregateId,
    commandHash: input.commandHash,
    actorKind: 'human',
    actorId: input.actorIdentityId,
    actorIdentityId: input.actorIdentityId,
    resultMetadata: input.resultMetadata,
    createdAt: input.now,
  });
};
